/**
 * Edge statistics — pure functions, no UI and no AI.
 *
 * The single source of truth for "is this method actually working": the
 * Performance page renders these numbers, and Ash will reason over the same
 * report, so what a user sees and what the agent says always agree.
 *
 * Sharpe and Sortino are per-trade and not annualized (the same basis FTMO
 * MetriX uses), so they line up with what traders see on their prop dashboard
 * and aren't inflated by annualizing a handful of days. Both are scale-free
 * (mean / deviation, risk-free rate 0), so no account size is needed.
 */
import type { Trade } from "./types";

export type StatsUnit = "usd" | "pips";

export interface EdgeStats {
  trades: number;
  winners: number;
  losers: number;
  breakeven: number;
  winRate: number; // 0–100
  netProfit: number;
  grossProfit: number;
  grossLoss: number; // negative
  profitFactor: number | null; // null = no losing trades
  avgTrade: number; // expectancy per trade
  avgWin: number;
  avgLoss: number; // negative
  winLossRatio: number | null;
  largestWin: number;
  largestLoss: number; // negative
  maxConsecWins: number;
  maxConsecLosses: number;
  maxDrawdown: number; // positive, peak-to-trough on closed P&L
  currentDrawdown: number;
  recoveryFactor: number | null; // net profit / max drawdown
  longestDrawdownDays: number; // calendar days between equity highs
  tradingDays: number;
  avgTradesPerDay: number;
  avgDailyPnl: number;
  dayWinRate: number; // 0–100
  sharpe: number | null; // per trade, not annualized
  sortino: number | null; // per trade, not annualized
  firstDate: string | null;
  lastDate: string | null;
}

export interface NextDayBehavior {
  days: number; // how many days followed a day of this kind
  avgTrades: number;
  avgPnl: number;
  dayWinRate: number; // 0–100
}

export type ConfidenceLevel = "low" | "medium" | "high";

export interface EdgeReport {
  unit: StatsUnit;
  excluded: number; // trades left out because they had no P&L in `unit`
  all: EdgeStats;
  long: EdgeStats;
  short: EdgeStats;
  confidence: { level: ConfidenceLevel; note: string };
  afterRedDay: NextDayBehavior;
  afterGreenDay: NextDayBehavior;
}

const DAY_MS = 86_400_000;

// Use dollars when most trades have them; otherwise fall back to pips so
// manually logged trades without a $ figure still get a report.
const USD_COVERAGE_THRESHOLD = 0.8;

function pickUnit(trades: Trade[]): StatsUnit {
  if (!trades.length) return "usd";
  const withUsd = trades.filter((t) => t.pnl_dollar != null).length;
  return withUsd / trades.length >= USD_COVERAGE_THRESHOLD ? "usd" : "pips";
}

function valueOf(t: Trade, unit: StatsUnit): number | null {
  return unit === "usd" ? t.pnl_dollar ?? null : t.pnl_pips;
}

function chronological(a: Trade, b: Trade): number {
  return (
    a.trade_date.localeCompare(b.trade_date) ||
    (a.created_at || "").localeCompare(b.created_at || "") ||
    (a.id || "").localeCompare(b.id || "")
  );
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function sampleStd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Daily P&L in date order, plus trade counts per day. */
function dailySeries(points: { date: string; v: number }[]) {
  const map = new Map<string, { pnl: number; count: number }>();
  for (const p of points) {
    const d = map.get(p.date) || { pnl: 0, count: 0 };
    d.pnl += p.v;
    d.count++;
    map.set(p.date, d);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, ...d }));
}

function computeStats(points: { date: string; v: number }[]): EdgeStats {
  const wins = points.filter((p) => p.v > 0).map((p) => p.v);
  const losses = points.filter((p) => p.v < 0).map((p) => p.v);
  const grossProfit = wins.reduce((s, x) => s + x, 0);
  const grossLoss = losses.reduce((s, x) => s + x, 0);
  const netProfit = grossProfit + grossLoss;
  const avgWin = mean(wins);
  const avgLoss = mean(losses);

  // Streaks (breakeven trades don't break a streak)
  let maxConsecWins = 0, maxConsecLosses = 0, runW = 0, runL = 0;
  for (const p of points) {
    if (p.v > 0) { runW++; runL = 0; }
    else if (p.v < 0) { runL++; runW = 0; }
    maxConsecWins = Math.max(maxConsecWins, runW);
    maxConsecLosses = Math.max(maxConsecLosses, runL);
  }

  // Drawdown on closed-trade equity, starting from 0
  let equity = 0, peak = 0, maxDrawdown = 0;
  for (const p of points) {
    equity += p.v;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const currentDrawdown = peak - equity;

  const days = dailySeries(points);
  const dailyPnl = days.map((d) => d.pnl);

  // Longest time underwater (calendar days from the peak until equity gets
  // back to it), an unrecovered drawdown counted up to the last trading day
  let longestDrawdownDays = 0;
  if (days.length) {
    let dayEquity = 0, dayPeak = 0, peakDate = days[0].date, underwater = false;
    for (const d of days) {
      dayEquity += d.pnl;
      if (dayEquity >= dayPeak) {
        if (underwater) longestDrawdownDays = Math.max(longestDrawdownDays, daysBetween(peakDate, d.date));
        underwater = false;
        dayPeak = dayEquity;
        peakDate = d.date;
      } else {
        underwater = true;
      }
    }
    if (underwater) {
      longestDrawdownDays = Math.max(longestDrawdownDays, daysBetween(peakDate, days[days.length - 1].date));
    }
  }

  const values = points.map((p) => p.v);
  const avgTrade = mean(values);
  const tradeStd = sampleStd(values);
  const downsideDev = values.length
    ? Math.sqrt(values.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / values.length)
    : 0;

  return {
    trades: points.length,
    winners: wins.length,
    losers: losses.length,
    breakeven: points.length - wins.length - losses.length,
    winRate: points.length ? (wins.length / points.length) * 100 : 0,
    netProfit,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss < 0 ? grossProfit / -grossLoss : null,
    avgTrade,
    avgWin,
    avgLoss,
    winLossRatio: avgLoss < 0 ? avgWin / -avgLoss : null,
    largestWin: wins.length ? Math.max(...wins) : 0,
    largestLoss: losses.length ? Math.min(...losses) : 0,
    maxConsecWins,
    maxConsecLosses,
    maxDrawdown,
    currentDrawdown,
    recoveryFactor: maxDrawdown > 0 ? netProfit / maxDrawdown : null,
    longestDrawdownDays,
    tradingDays: days.length,
    avgTradesPerDay: days.length ? points.length / days.length : 0,
    avgDailyPnl: mean(dailyPnl),
    dayWinRate: days.length ? (dailyPnl.filter((x) => x > 0).length / days.length) * 100 : 0,
    sharpe: tradeStd > 0 ? avgTrade / tradeStd : null,
    sortino: downsideDev > 0 ? avgTrade / downsideDev : null,
    firstDate: days[0]?.date ?? null,
    lastDate: days[days.length - 1]?.date ?? null,
  };
}

/** How the trader behaves on the trading day after a red (or green) day. */
function nextDayBehavior(points: { date: string; v: number }[]) {
  const days = dailySeries(points);
  const after = { red: [] as typeof days, green: [] as typeof days };
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1].pnl < 0) after.red.push(days[i]);
    else if (days[i - 1].pnl > 0) after.green.push(days[i]);
  }
  const summarize = (ds: typeof days): NextDayBehavior => ({
    days: ds.length,
    avgTrades: mean(ds.map((d) => d.count)),
    avgPnl: mean(ds.map((d) => d.pnl)),
    dayWinRate: ds.length ? (ds.filter((d) => d.pnl > 0).length / ds.length) * 100 : 0,
  });
  return { afterRedDay: summarize(after.red), afterGreenDay: summarize(after.green) };
}

function confidenceFor(trades: number, days: number): EdgeReport["confidence"] {
  if (trades < 30 || days < 10) {
    return {
      level: "low",
      note: `${trades} trades over ${days} days — too few to tell skill from luck. Treat these numbers as a snapshot, not proof.`,
    };
  }
  if (trades < 100 || days < 40) {
    return {
      level: "medium",
      note: `${trades} trades over ${days} days — a pattern is forming, but one outlier day can still swing the ratios.`,
    };
  }
  return {
    level: "high",
    note: `${trades} trades over ${days} days — enough data for these numbers to mean something.`,
  };
}

export function computeEdgeReport(trades: Trade[]): EdgeReport {
  const unit = pickUnit(trades);
  const usable = trades
    .filter((t) => valueOf(t, unit) !== null)
    .sort(chronological);
  const toPoints = (ts: Trade[]) => ts.map((t) => ({ date: t.trade_date, v: valueOf(t, unit) as number }));

  const allPoints = toPoints(usable);
  const all = computeStats(allPoints);

  return {
    unit,
    excluded: trades.length - usable.length,
    all,
    long: computeStats(toPoints(usable.filter((t) => t.direction === "long"))),
    short: computeStats(toPoints(usable.filter((t) => t.direction === "short"))),
    confidence: confidenceFor(all.trades, all.tradingDays),
    ...nextDayBehavior(allPoints),
  };
}
