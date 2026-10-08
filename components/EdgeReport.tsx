"use client";

import { Fragment, useState } from "react";
import type { EdgeReport as Report, EdgeStats, SizeBasis, StatsUnit } from "@/lib/trade-stats";
import { formatDollar } from "@/lib/trade-math";
import StatCard from "@/components/StatCard";

const GREEN = "#22c55e";
const RED = "#ef4444";
const ORANGE = "#e8651a";

function money(v: number, unit: StatsUnit): string {
  return unit === "usd" ? formatDollar(v) : `${v.toFixed(1)} pips`;
}

function ratio(v: number | null, hasWins = false): string {
  if (v === null) return hasWins ? "∞" : "—";
  return v.toFixed(2);
}

function duration(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${Math.round(min - h * 60)}m`;
}

function size(v: number | null, basis: SizeBasis): string {
  if (v === null) return "—";
  return basis === "lots" ? `${v.toFixed(1)} lots` : formatDollar(v);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function signColor(v: number): string | undefined {
  return v > 0 ? GREEN : v < 0 ? RED : undefined;
}

type Row = {
  label: string;
  value: (s: EdgeStats) => string;
  color?: (s: EdgeStats) => string | undefined;
  hint: string;
};

function rows(unit: StatsUnit): (Row | "gap")[] {
  return [
    { label: "Net profit", value: (s) => money(s.netProfit, unit), color: (s) => signColor(s.netProfit), hint: "Everything you made minus everything you lost. FTMO imports include swap and commission, so this matches your FTMO dashboard." },
    { label: "Gross profit", value: (s) => money(s.grossProfit, unit), hint: "All your winning trades added together." },
    { label: "Gross loss", value: (s) => money(s.grossLoss, unit), color: (s) => (s.grossLoss < 0 ? RED : undefined), hint: "All your losing trades added together." },
    { label: "Profit factor", value: (s) => ratio(s.profitFactor, s.winners > 0), color: (s) => (s.profitFactor === null ? undefined : s.profitFactor > 1.5 ? GREEN : s.profitFactor > 1 ? ORANGE : RED), hint: "Gross profit ÷ gross loss. Above 1 means you're profitable. 1.5+ is solid, 2+ is strong." },
    { label: "Expectancy / trade", value: (s) => money(s.avgTrade, unit), color: (s) => signColor(s.avgTrade), hint: "What the average trade makes or loses. Positive means you have an edge, as long as the sample is big enough." },
    "gap",
    { label: "Sharpe ratio", value: (s) => ratio(s.sharpe), color: (s) => (s.sharpe === null ? undefined : s.sharpe >= 0.3 ? GREEN : s.sharpe > 0 ? ORANGE : RED), hint: "Average trade ÷ how much your results swing from trade to trade. Calculated per trade, the same basis FTMO uses. 0.3+ is solid." },
    { label: "Sortino ratio", value: (s) => ratio(s.sortino), color: (s) => (s.sortino === null ? undefined : s.sortino >= 0.5 ? GREEN : s.sortino > 0 ? ORANGE : RED), hint: "Like Sharpe, but only losing trades count as risk, so big winners don't drag it down. 0.5+ is solid." },
    { label: "Max drawdown", value: (s) => money(-s.maxDrawdown, unit), color: (s) => (s.maxDrawdown > 0 ? RED : undefined), hint: "Biggest drop from a profit peak to a low, on closed trades. Compare it to your prop firm's max-loss limit." },
    { label: "Recovery factor", value: (s) => ratio(s.recoveryFactor), hint: "Net profit ÷ max drawdown. Above 2 means your profit comfortably outweighs your worst dip." },
    { label: "Longest drawdown", value: (s) => plural(s.longestDrawdownDays, "day"), hint: "Most calendar days you spent below a previous equity high before getting back to it." },
    "gap",
    { label: "Total trades", value: (s) => String(s.trades), hint: "Closed trades in this date range. Under 30 is too few to judge a method." },
    { label: "Win rate", value: (s) => `${s.winRate.toFixed(1)}%`, hint: "Share of trades that made money. A low win rate is fine if your winners are much bigger than your losers." },
    { label: "Winners / losers", value: (s) => `${s.winners} / ${s.losers}${s.breakeven ? ` / ${s.breakeven} BE` : ""}`, hint: "How many trades won, lost, or broke even (BE)." },
    { label: "Avg win", value: (s) => money(s.avgWin, unit), color: () => GREEN, hint: "Average result of your winning trades." },
    { label: "Avg loss", value: (s) => money(s.avgLoss, unit), color: () => RED, hint: "Average result of your losing trades. It should be close to your planned risk if you respect your stops." },
    { label: "Avg win ÷ avg loss", value: (s) => ratio(s.winLossRatio, s.winners > 0), hint: "How many times bigger your average winner is than your average loser. To break even you need at least losers ÷ winners. At a 25% win rate that's 3." },
    { label: "Largest win", value: (s) => money(s.largestWin, unit), hint: "Your single best trade. If it's most of your profit, your results depend on rare big winners." },
    { label: "Largest loss", value: (s) => money(s.largestLoss, unit), color: (s) => (s.largestLoss < 0 ? RED : undefined), hint: "Your single worst trade. If it's much bigger than your average loss, a stop was moved or skipped." },
    { label: "Max consec. winners", value: (s) => String(s.maxConsecWins), hint: "Longest run of winning trades in a row." },
    { label: "Max consec. losers", value: (s) => String(s.maxConsecLosses), hint: "Longest run of losing trades in a row. Size so that a streak twice this long still won't hit your loss limits." },
    "gap",
    { label: "Risk known on", value: (s) => `${s.riskTrades} of ${s.trades}`, hint: "Trades where we know your $ risk: imported with a stop loss, or entered with one. Trades whose stop was moved to breakeven or into profit are left out." },
    { label: "Avg risk / trade", value: (s) => (s.avgRisk === null ? "—" : formatDollar(s.avgRisk)), hint: "Average dollars at risk per trade, measured from entry to stop loss." },
    { label: "Risk swing", value: (s) => (s.riskSwing === null ? "—" : `±${s.riskSwing.toFixed(0)}%`), color: (s) => (s.riskSwing === null ? undefined : s.riskSwing <= 20 ? GREEN : s.riskSwing <= 40 ? ORANGE : RED), hint: "How much your $ risk changes from trade to trade. Under ±20% is consistent. Big swings usually mean sizing on emotion." },
    { label: "Expectancy (R)", value: (s) => (s.expectancyR === null ? "—" : `${s.expectancyR >= 0 ? "+" : ""}${s.expectancyR.toFixed(2)}R`), color: (s) => (s.expectancyR === null ? undefined : signColor(s.expectancyR)), hint: "Average result in units of what you risked (R). +0.2R means each trade earns 20% of its risk on average. Positive is an edge." },
    { label: "Avg winner (R)", value: (s) => (s.avgWinR === null ? "—" : `${s.avgWinR.toFixed(2)}R`), hint: "Your average winning trade measured in R. 2R means you made twice what you risked." },
    { label: "Avg hold, winners", value: (s) => duration(s.avgHoldWinMin), hint: "Average time you stay in winning trades." },
    { label: "Avg hold, losers", value: (s) => duration(s.avgHoldLossMin), color: (s) => (s.avgHoldLossMin !== null && s.avgHoldWinMin !== null && s.avgHoldLossMin > s.avgHoldWinMin * 1.5 ? RED : undefined), hint: "Average time you stay in losing trades. Turns red when you hold losers much longer than winners, which usually means hoping instead of cutting." },
    "gap",
    { label: "Trading days", value: (s) => String(s.tradingDays), hint: "Days with at least one closed trade." },
    { label: "Avg trades / day", value: (s) => s.avgTradesPerDay.toFixed(1), hint: "Trades per trading day. If this jumps on bad days, it can mean overtrading." },
    { label: "Avg daily P&L", value: (s) => money(s.avgDailyPnl, unit), color: (s) => signColor(s.avgDailyPnl), hint: "Your average result per trading day." },
    { label: "Green-day rate", value: (s) => `${s.dayWinRate.toFixed(0)}%`, hint: "Share of trading days that ended positive." },
  ];
}

const CONFIDENCE_STYLE = {
  low: { color: RED, label: "LOW CONFIDENCE" },
  medium: { color: ORANGE, label: "MEDIUM CONFIDENCE" },
  high: { color: GREEN, label: "HIGH CONFIDENCE" },
} as const;

export default function EdgeReport({ report }: { report: Report }) {
  const { unit, all, long, short, confidence, afterRedDay, afterGreenDay, excluded, sizeBasis, afterLosingTrade, afterWinningTrade } = report;
  const [openHint, setOpenHint] = useState<string | null>(null);
  const sizesUpAfterLoss =
    afterLosingTrade.avgSize !== null && afterWinningTrade.avgSize !== null && afterLosingTrade.avgSize > afterWinningTrade.avgSize * 1.15;

  if (!all.trades) {
    return <p className="text-chamber-text-muted text-sm">No trades in this range.</p>;
  }

  const conf = CONFIDENCE_STYLE[confidence.level];
  const columns: [string, EdgeStats][] = [["All trades", all], ["Long", long], ["Short", short]];

  return (
    <div>
      <div
        className="rounded-lg border px-3 py-2 mb-4 text-xs md:text-sm"
        style={{ borderColor: `${conf.color}55`, background: `${conf.color}12` }}
      >
        <span className="font-bold tracking-wide mr-2" style={{ color: conf.color }}>{conf.label}</span>
        <span className="text-chamber-text-muted">{confidence.note}</span>
        {excluded > 0 && (
          <span className="block text-chamber-text-dim mt-1">
            {excluded} trade{excluded === 1 ? "" : "s"} without a {unit === "usd" ? "$ P&L" : "pip value"} left out.
          </span>
        )}
      </div>

      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[420px] text-xs md:text-sm border-collapse">
          <thead>
            <tr className="text-chamber-text-muted text-[0.65rem] md:text-xs uppercase tracking-widest">
              <th className="text-left font-medium py-2 pr-2">Metric</th>
              {columns.map(([label]) => (
                <th key={label} className="text-right font-medium py-2 px-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows(unit).map((row, i) =>
              row === "gap" ? (
                <tr key={i}><td colSpan={4} className="h-3" /></tr>
              ) : (
                <Fragment key={row.label}>
                <tr className="border-t border-chamber-border">
                  <td className="py-1.5 pr-2">
                    <button
                      type="button"
                      onClick={() => setOpenHint(openHint === row.label ? null : row.label)}
                      aria-expanded={openHint === row.label}
                      className={`text-left transition-colors hover:text-chamber-text ${openHint === row.label ? "text-chamber-orange" : "text-chamber-text-muted"}`}
                    >
                      {row.label}
                      <span className="ml-1 text-chamber-text-dim">ⓘ</span>
                    </button>
                  </td>
                  {columns.map(([label, s]) => (
                    <td key={label} className="py-1.5 px-2 text-right font-semibold tabular-nums" style={{ color: s.trades ? row.color?.(s) : undefined }}>
                      {s.trades ? row.value(s) : "—"}
                    </td>
                  ))}
                </tr>
                {openHint === row.label && (
                  <tr>
                    <td colSpan={4} className="pb-2">
                      {/* Sticky + capped width keeps the box on screen while the table scrolls sideways on phones */}
                      <div className="sticky left-0 max-w-[calc(100vw-2rem)] md:max-w-none rounded-md border border-chamber-orange/30 bg-chamber-orange/5 px-3 py-2 text-xs leading-relaxed text-chamber-text-muted">
                        {row.hint}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              )
            )}
          </tbody>
        </table>
      </div>

      {(afterRedDay.days > 0 || afterGreenDay.days > 0) && (
        <>
          <div className="border-t border-chamber-border my-4" />
          <p className="font-bold mb-1 text-sm">The day after</p>
          <p className="text-chamber-text-dim text-xs mb-3">How you trade the session after a red day vs after a green day.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Trades after red" value={afterRedDay.days ? afterRedDay.avgTrades.toFixed(1) : "—"} subText={plural(afterRedDay.days, "day")} color={afterRedDay.avgTrades > afterGreenDay.avgTrades * 1.25 ? RED : undefined} />
            <StatCard label="Trades after green" value={afterGreenDay.days ? afterGreenDay.avgTrades.toFixed(1) : "—"} subText={plural(afterGreenDay.days, "day")} />
            <StatCard label="Avg P&L after red" value={afterRedDay.days ? money(afterRedDay.avgPnl, unit) : "—"} color={signColor(afterRedDay.avgPnl)} subText={afterRedDay.days ? `${afterRedDay.dayWinRate.toFixed(0)}% green` : ""} />
            <StatCard label="Avg P&L after green" value={afterGreenDay.days ? money(afterGreenDay.avgPnl, unit) : "—"} color={signColor(afterGreenDay.avgPnl)} subText={afterGreenDay.days ? `${afterGreenDay.dayWinRate.toFixed(0)}% green` : ""} />
          </div>
        </>
      )}

      {sizeBasis && (afterLosingTrade.trades > 0 || afterWinningTrade.trades > 0) && (
        <>
          <div className="border-t border-chamber-border my-4" />
          <p className="font-bold mb-1 text-sm">Sizing after a loss</p>
          <p className="text-chamber-text-dim text-xs mb-3">
            Average {sizeBasis === "risk" ? "$ risk" : "lot size"} on the next trade after a loser vs after a winner.
            {sizesUpAfterLoss && afterWinningTrade.avgSize
              ? <span style={{ color: RED }}> You size up {Math.round((afterLosingTrade.avgSize! / afterWinningTrade.avgSize - 1) * 100)}% after losses.</span>
              : null}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="After a loss" value={size(afterLosingTrade.avgSize, sizeBasis)} subText={plural(afterLosingTrade.trades, "trade")} color={sizesUpAfterLoss ? RED : undefined} />
            <StatCard label="After a win" value={size(afterWinningTrade.avgSize, sizeBasis)} subText={plural(afterWinningTrade.trades, "trade")} />
            <StatCard label="Day after red" value={size(afterRedDay.avgSize, sizeBasis)} subText={plural(afterRedDay.days, "day")} />
            <StatCard label="Day after green" value={size(afterGreenDay.avgSize, sizeBasis)} subText={plural(afterGreenDay.days, "day")} />
          </div>
        </>
      )}
    </div>
  );
}
