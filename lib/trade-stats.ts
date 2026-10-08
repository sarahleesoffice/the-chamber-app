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
 *
 * R-multiples, sizing and hold times need broker-import fields (risk_dollar,
 * lot_size, open/close time); they come back null when trades lack them.
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
  riskTrades: number; // trades with a known $ risk
  avgRisk: number | null; // $ risked per trade
  riskSwing: number | null; // spread of $ risk between trades, % of the average
  expectancyR: number | null; // average R-multiple
  avgWinR: number | null;
  avgHoldWinMin: number | null;
  avgHoldLossMin: number | null;
  firstDate: string | null;
  lastDate: string | null;
}

export interface NextDayBehavior {
  days: number; // how many days followed a day of this kind
  avgTrades: number;
  avgPnl: number;
  dayWinRate: number; // 0–100
  avgSize: number | null; // avg size per trade on those days (see sizeBasis)
}

export interface SizingAfterTrade {
  trades: number; // trades opened right after a trade of this kind closed
  avgSize: number | null;
}

/** What "size" means for sizing checks: $ risk when known, else lots. */
export type SizeBasis = "risk" | "lots" | null;

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
  sizeBasis: SizeBasis;
  afterLosingTrade: SizingAfterTrade;
  afterWinningTrade: SizingAfterTrade;
}

interface Point {
  date: string;
  v: number; // P&L in the report unit
  usd: number | null;
  risk: number | null;
  lots: number | null;
  open: string | null;
  close: string | null;
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

// Close order: a trade's outcome counts from when it closed
function chronological(a: Trade, b: Trade): number {
  return (
    (a.close_time || a.trade_date).localeCompare(b.close_time || b.trade_date) ||
    (a.open_time || "").localeCompare(b.open_time || "") ||
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

function meanOrNull(xs: number[]): number | null {
  return xs.length ? mean(xs) : null;
}

function holdMinutes(p: Point): number | null {
  if (!p.open || !p.close) return null;
  const ms = Date.parse(p.close) - Date.parse(p.open);
  return isFinite(ms) && ms >= 0 ? ms / 60_000 : null;
}

function pickSizeBasis(points: Point[]): SizeBasis {
  if (!points.length) return null;
  const share = (f: (p: Point) => unknown) => points.filter(f).length / points.length;
  if (share((p) => p.risk) >= 0.5) return "risk";
  if (share((p) => p.lots) >= 0.5) return "lots";
  return null;
}

function sizeOf(p: Point, basis: SizeBasis): number | null {
  return basis === "risk" ? p.risk : basis === "lots" ? p.lots : null;
}

/** Daily P&L in date order, plus the trades on each day. */
function dailySeries(points: Point[]) {
  const map = new Map<string, { pnl: number; count: number; items: Point[] }>();
  for (const p of points) {
    const d = map.get(p.date) || { pnl: 0, count: 0, items: [] };
    d.pnl += p.v;
    d.count++;
    d.items.push(p);
    map.set(p.date, d);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, ...d }));
}

function computeStats(points: Point[]): EdgeStats {
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

  const risked = points.filter((p) => p.risk && p.usd !== null);
  const risks = risked.map((p) => p.risk as number);
  const rMultiples = risked.map((p) => (p.usd as number) / (p.risk as number));
  const avgRisk = meanOrNull(risks);
  const holdOf = (ps: Point[]) => ps.map(holdMinutes).filter((m): m is number => m !== null);

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
    riskTrades: risked.length,
    avgRisk,
    riskSwing: risks.length >= 2 && avgRisk ? (sampleStd(risks) / avgRisk) * 100 : null,
    expectancyR: meanOrNull(rMultiples),
    avgWinR: meanOrNull(rMultiples.filter((r) => r > 0)),
    avgHoldWinMin: meanOrNull(holdOf(points.filter((p) => p.v > 0))),
    avgHoldLossMin: meanOrNull(holdOf(points.filter((p) => p.v < 0))),
    firstDate: days[0]?.date ?? null,
    lastDate: days[days.length - 1]?.date ?? null,
  };
}

/** How the trader behaves on the trading day after a red (or green) day. */
function nextDayBehavior(points: Point[], basis: SizeBasis) {
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
    avgSize: meanOrNull(
      ds.flatMap((d) => d.items.map((p) => sizeOf(p, basis))).filter((x): x is number => x !== null)
    ),
  });
  return { afterRedDay: summarize(after.red), afterGreenDay: summarize(after.green) };
}

/**
 * Size of each trade vs the outcome of the most recent trade that had CLOSED
 * when it was opened: the "did you size up to win it back" check. Needs
 * open/close times; trades without them are skipped.
 */
function sizingAfterTrade(points: Point[], basis: SizeBasis) {
  const timed = points.filter((p) => p.open && p.close);
  const byOpen = [...timed].sort((a, b) => (a.open as string).localeCompare(b.open as string));
  const byClose = [...timed].sort((a, b) => (a.close as string).localeCompare(b.close as string));
  const sizes = { loss: [] as number[], win: [] as number[] };
  let next = 0;
  let lastClosed: Point | null = null;
  for (const p of byOpen) {
    while (next < byClose.length && (byClose[next].close as string) <= (p.open as string)) {
      lastClosed = byClose[next++];
    }
    const size = sizeOf(p, basis);
    if (!lastClosed || size === null) continue;
    if (lastClosed.v < 0) sizes.loss.push(size);
    else if (lastClosed.v > 0) sizes.win.push(size);
  }
  const summarize = (xs: number[]): SizingAfterTrade => ({ trades: xs.length, avgSize: meanOrNull(xs) });
  return { afterLosingTrade: summarize(sizes.loss), afterWinningTrade: summarize(sizes.win) };
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
  const toPoints = (ts: Trade[]): Point[] =>
    ts.map((t) => ({
      date: t.trade_date,
      v: valueOf(t, unit) as number,
      usd: t.pnl_dollar ?? null,
      risk: t.risk_dollar || null,
      lots: t.lot_size || null,
      open: t.open_time || null,
      close: t.close_time || null,
    }));

  const allPoints = toPoints(usable);
  const all = computeStats(allPoints);
  const sizeBasis = pickSizeBasis(allPoints);

  return {
    unit,
    excluded: trades.length - usable.length,
    all,
    long: computeStats(toPoints(usable.filter((t) => t.direction === "long"))),
    short: computeStats(toPoints(usable.filter((t) => t.direction === "short"))),
    confidence: confidenceFor(all.trades, all.tradingDays),
    ...nextDayBehavior(allPoints, sizeBasis),
    sizeBasis,
    ...sizingAfterTrade(allPoints, sizeBasis),
  };
}
