from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import numpy as np
import pandas as pd
import yfinance as yf

StrategyName = Literal["OB+FVG", "MSS+OTE", "Silver Bullet"]

PAIR_TO_TICKER = {
    "EUR/USD": "EURUSD=X",
    "GBP/USD": "GBPUSD=X",
    "USD/JPY": "JPY=X",
    "AUD/USD": "AUDUSD=X",
    "USD/CAD": "CAD=X",
    "NZD/USD": "NZDUSD=X",
    "USD/CHF": "CHF=X",
    "XAU/USD": "GC=F",
    "NAS100": "NQ=F",
    "MNQ": "MNQ=F",
}


@dataclass
class BacktestResult:
    trades: pd.DataFrame
    equity_curve: pd.DataFrame
    win_rate: float
    max_drawdown: float
    profit_factor: float
    total_return_pct: float


def ticker_for_pair(pair: str) -> str:
    return PAIR_TO_TICKER.get(pair, pair)


def fetch_price_data(pair: str, start_date: str, end_date: str, interval: str = "1h") -> pd.DataFrame:
    ticker = ticker_for_pair(pair)
    df = yf.download(ticker, start=start_date, end=end_date, interval=interval, auto_adjust=False, progress=False)
    if df is None or df.empty:
        raise ValueError(f"No data returned from yfinance for {ticker}")

    # Normalize columns for multi-index vs single-index download variants
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]

    expected = {"Open", "High", "Low", "Close"}
    if not expected.issubset(set(df.columns)):
        raise ValueError("Downloaded data is missing OHLC columns")

    df = df[["Open", "High", "Low", "Close"]].dropna().copy()
    return df


def _compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["ema20"] = out["Close"].ewm(span=20, adjust=False).mean()
    out["ema50"] = out["Close"].ewm(span=50, adjust=False).mean()
    out["atr"] = (out["High"] - out["Low"]).rolling(14).mean().fillna(method="bfill")
    out["swing_high"] = out["High"].rolling(5).max()
    out["swing_low"] = out["Low"].rolling(5).min()
    out["ret_1"] = out["Close"].pct_change().fillna(0)
    return out


def _generate_signals(df: pd.DataFrame, strategy: StrategyName) -> pd.Series:
    sig = pd.Series(0, index=df.index, dtype=int)

    if strategy == "OB+FVG":
        # Simplified FVG proxy: three-candle imbalance + trend filter
        bullish_gap = (df["Low"] > df["High"].shift(2))
        bearish_gap = (df["High"] < df["Low"].shift(2))
        sig[(bullish_gap) & (df["Close"] > df["ema50"])] = 1
        sig[(bearish_gap) & (df["Close"] < df["ema50"])] = -1

    elif strategy == "MSS+OTE":
        # MSS proxy: break rolling swing levels, OTE proxy: pullback toward 62-79% area
        bullish_mss = df["Close"] > df["swing_high"].shift(1)
        bearish_mss = df["Close"] < df["swing_low"].shift(1)

        recent_hi = df["High"].rolling(20).max()
        recent_lo = df["Low"].rolling(20).min()
        rng = (recent_hi - recent_lo).replace(0, np.nan)
        fib62 = recent_hi - (0.62 * rng)
        fib79 = recent_hi - (0.79 * rng)
        in_ote_long = (df["Close"] <= fib62) & (df["Close"] >= fib79)

        fib62s = recent_lo + (0.62 * rng)
        fib79s = recent_lo + (0.79 * rng)
        in_ote_short = (df["Close"] >= fib62s) & (df["Close"] <= fib79s)

        sig[bullish_mss & in_ote_long] = 1
        sig[bearish_mss & in_ote_short] = -1

    elif strategy == "Silver Bullet":
        # Time-window momentum/reversion hybrid (NY windows style)
        idx = pd.to_datetime(df.index)
        hours = idx.hour
        minutes = idx.minute
        in_window = ((hours == 10) | (hours == 14))  # rough 10:00/14:00 windows in exchange time
        long_cond = in_window & (df["Close"] > df["ema20"]) & (df["ret_1"] > 0)
        short_cond = in_window & (df["Close"] < df["ema20"]) & (df["ret_1"] < 0)
        sig[long_cond] = 1
        sig[short_cond] = -1

    return sig


def run_backtest(
    pair: str,
    start_date: str,
    end_date: str,
    strategy: StrategyName,
    initial_equity: float = 10_000.0,
    risk_per_trade_pct: float = 1.0,
) -> BacktestResult:
    df = fetch_price_data(pair, start_date, end_date)
    df = _compute_indicators(df)
    signals = _generate_signals(df, strategy)

    equity = initial_equity
    equity_points = []
    trades = []

    for i in range(1, len(df) - 1):
        sig = signals.iloc[i]
        if sig == 0:
            equity_points.append((df.index[i], equity))
            continue

        entry = float(df["Close"].iloc[i])
        nxt = df.iloc[i + 1]
        atr = max(float(df["atr"].iloc[i]), 1e-9)

        # 1R stop and 1.8R target model
        stop_dist = atr
        target_dist = atr * 1.8

        if sig == 1:
            stop = entry - stop_dist
            target = entry + target_dist
            hit_target = float(nxt["High"]) >= target
            hit_stop = float(nxt["Low"]) <= stop
        else:
            stop = entry + stop_dist
            target = entry - target_dist
            hit_target = float(nxt["Low"]) <= target
            hit_stop = float(nxt["High"]) >= stop

        # Resolve same-bar collisions conservatively
        if hit_target and hit_stop:
            outcome_r = -1.0
            exit_price = stop
        elif hit_target:
            outcome_r = 1.8
            exit_price = target
        elif hit_stop:
            outcome_r = -1.0
            exit_price = stop
        else:
            # close at next bar close if neither touched
            move = (float(nxt["Close"]) - entry) * (1 if sig == 1 else -1)
            outcome_r = move / stop_dist
            exit_price = float(nxt["Close"])

        risk_value = equity * (risk_per_trade_pct / 100.0)
        pnl = risk_value * outcome_r
        equity += pnl

        trades.append({
            "timestamp": df.index[i],
            "direction": "long" if sig == 1 else "short",
            "entry": entry,
            "exit": exit_price,
            "r_multiple": outcome_r,
            "pnl": pnl,
            "equity": equity,
        })

        equity_points.append((df.index[i], equity))

    equity_curve = pd.DataFrame(equity_points, columns=["timestamp", "equity"]).set_index("timestamp")
    trades_df = pd.DataFrame(trades)

    if trades_df.empty:
        return BacktestResult(
            trades=trades_df,
            equity_curve=equity_curve,
            win_rate=0.0,
            max_drawdown=0.0,
            profit_factor=0.0,
            total_return_pct=0.0,
        )

    wins = trades_df[trades_df["pnl"] > 0]["pnl"].sum()
    losses = trades_df[trades_df["pnl"] < 0]["pnl"].sum()
    win_rate = float((trades_df["pnl"] > 0).mean() * 100)

    running_max = equity_curve["equity"].cummax()
    drawdown = (equity_curve["equity"] - running_max) / running_max
    max_dd = float(abs(drawdown.min()) * 100) if not drawdown.empty else 0.0

    profit_factor = float(wins / abs(losses)) if losses != 0 else float("inf")
    total_return = float((equity - initial_equity) / initial_equity * 100)

    return BacktestResult(
        trades=trades_df,
        equity_curve=equity_curve,
        win_rate=win_rate,
        max_drawdown=max_dd,
        profit_factor=profit_factor,
        total_return_pct=total_return,
    )
