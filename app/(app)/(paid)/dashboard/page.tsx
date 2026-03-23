"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Trade, JournalEntry } from "@/lib/types";
import { formatDollar } from "@/lib/trade-math";
import StatCard from "@/components/StatCard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  format,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  eachDayOfInterval,
  getDay,
  isToday,
} from "date-fns";

// ICT Concept of the Day — rotates daily
const ICT_CONCEPTS = [
  { title: "Order Blocks", color: "#e8651a", concept: "The last opposing candle before a displacement move. This is where institutional orders were placed.", tip: "Mark the OB body (open to close). The optimal entry is at the 50% level." },
  { title: "Fair Value Gaps (FVG)", color: "#3b82f6", concept: "A 3-candle pattern where candle 1's wick and candle 3's wick don't overlap, creating an imbalance.", tip: "FVGs that form during displacement are the most reliable. Use the C.E. (50%) as your entry." },
  { title: "Liquidity Sweeps", color: "#a855f7", concept: "Smart money needs liquidity to fill large orders. Equal highs/lows and obvious S/R are where retail stops cluster.", tip: "Never place stops at obvious levels. Wait for the sweep, then look for MSS + displacement." },
  { title: "Market Structure Shift (MSS)", color: "#22c55e", concept: "The first sign the trend is changing. Price breaks above the most recent lower high (or below higher low).", tip: "Wait for MSS on the 15m or 5m after a sweep of HTF liquidity. The FVG left behind is your entry." },
  { title: "Optimal Trade Entry (OTE)", color: "#e8651a", concept: "After MSS, the 62-79% Fibonacci retracement zone is the sweet spot (70.5%). Combine with OB or FVG.", tip: "Draw fib from the leg that caused the MSS. Look for an OB or FVG sitting in the 62-79% zone." },
  { title: "Power of 3 (AMD)", color: "#3b82f6", concept: "Every session follows: Accumulation (Asia), Manipulation (London sweep), Distribution (NY real move).", tip: "Mark Asia range before London opens. Wait for London to sweep one side, then trade the reversal." },
  { title: "Kill Zone Timing", color: "#a855f7", concept: "London Open (2-5 AM EST), NY Open (7-10 AM EST), London Close (10 AM-12 PM EST). Silver Bullets: 10-11 AM, 2-3 PM.", tip: "Only take trades during kill zones. If your setup forms at 1 PM, it's probably not worth taking." },
  { title: "ICT Macros", color: "#22c55e", concept: "20-minute micro windows: 9:50-10:10 AM, 10:50-11:10 AM, and 1:50-2:10 PM. Precision timing within kill zones.", tip: "Set alerts at 9:50, 10:50, and 1:50. Watch for FVG creation during these 20-minute windows." },
  { title: "Displacement", color: "#e8651a", concept: "Large-bodied candles with minimal wicks showing aggressive institutional flow. Creates FVGs, validates OBs, confirms MSS.", tip: "If the candle that breaks structure is small or has long wicks, it's not displacement. Wait for the real move." },
  { title: "Premium & Discount", color: "#3b82f6", concept: "Every dealing range has a 50% equilibrium. Above = premium (sell), below = discount (buy).", tip: "Draw a fib on the current dealing range. Above 50%, only look for shorts. Below 50%, only longs." },
  { title: "Breaker Blocks", color: "#a855f7", concept: "When an Order Block fails, it becomes a Breaker Block. What was support becomes resistance, and vice versa.", tip: "If a bullish OB gets run, mark it as a bearish breaker. Price will likely return to it as resistance." },
  { title: "Silver Bullet Setup", color: "#22c55e", concept: "A specific entry using FVGs created during Silver Bullet windows (10-11 AM or 2-3 PM EST).", tip: "Only trade Silver Bullets that align with your HTF bias. The AM window is stronger than PM." },
];

export default function DashboardPage() {
  const supabase = createClient();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [calMonth, setCalMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [tradesRes, journalsRes] = await Promise.all([
        supabase.from("trades").select("*").eq("user_id", user.id).order("trade_date", { ascending: false }),
        supabase.from("journal_entries").select("*").eq("user_id", user.id),
      ]);

      setTrades((tradesRes.data as Trade[]) || []);
      setJournals((journalsRes.data as JournalEntry[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  // Compute all-time stats
  const stats = useMemo(() => {
    if (!trades.length) return null;
    const winners = trades.filter((t) => t.pnl_pips > 0);
    const losers = trades.filter((t) => t.pnl_pips < 0);
    const totalDollar = trades.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
    const winRate = (winners.length / trades.length) * 100;
    const avgWin = winners.length ? winners.reduce((s, t) => s + (t.pnl_dollar || 0), 0) / winners.length : 0;
    const avgLoss = losers.length ? losers.reduce((s, t) => s + (t.pnl_dollar || 0), 0) / losers.length : 0;
    const grossWin = winners.reduce((s, t) => s + t.pnl_pips, 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl_pips, 0));
    const pf = grossLoss > 0 ? grossWin / grossLoss : 0;
    const rr = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0;

    // Max drawdown
    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    let peak = 0, maxDd = 0, running = 0;
    for (const t of sorted) {
      running += t.pnl_dollar || 0;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDd) maxDd = dd;
    }

    const tradingDays = new Set(trades.map((t) => t.trade_date));
    const winningDays = new Set<string>();
    const losingDays = new Set<string>();
    for (const d of tradingDays) {
      const dayPnl = trades.filter((t) => t.trade_date === d).reduce((s, t) => s + t.pnl_pips, 0);
      if (dayPnl > 0) winningDays.add(d);
      else if (dayPnl < 0) losingDays.add(d);
    }

    return {
      totalDollar, winRate, winners: winners.length, losers: losers.length,
      avgWin, avgLoss, pf, rr, maxDd, running,
      tradingDays: tradingDays.size, winningDays: winningDays.size, losingDays: losingDays.size,
    };
  }, [trades]);

  // Equity curve data
  const equityData = useMemo(() => {
    if (!trades.length) return [];
    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    let running = 0;
    const points: { date: string; pnl: number }[] = [];
    for (const t of sorted) {
      running += t.pnl_dollar || 0;
      points.push({ date: t.trade_date, pnl: Math.round(running * 100) / 100 });
    }
    return points;
  }, [trades]);

  // Win rate donut data
  const winRate = stats ? stats.winRate : 0;
  const winnersCount = stats ? stats.winners : 0;
  const losersCount = stats ? stats.losers : 0;
  const wrColor = winRate >= 55 ? "#22c55e" : winRate >= 45 ? "#e8651a" : "#ef4444";

  // Calendar data
  const monthTrades = useMemo(() => {
    const start = format(startOfMonth(calMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(calMonth), "yyyy-MM-dd");
    return trades.filter((t) => t.trade_date >= start && t.trade_date <= end);
  }, [trades, calMonth]);

  const dailyPnl = useMemo(() => {
    const map: Record<string, { pips: number; dollar: number; count: number }> = {};
    for (const t of monthTrades) {
      if (!map[t.trade_date]) map[t.trade_date] = { pips: 0, dollar: 0, count: 0 };
      map[t.trade_date].pips += t.pnl_pips;
      map[t.trade_date].dollar += t.pnl_dollar || 0;
      map[t.trade_date].count++;
    }
    return map;
  }, [monthTrades]);

  // Streaks
  const streakData = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");

    // Journal streak (consecutive days from today)
    const journalDates = new Set(journals.map((j) => j.journal_date));
    let journalStreak = 0;
    const checkDate = new Date();
    while (journalDates.has(format(checkDate, "yyyy-MM-dd"))) {
      journalStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Profitable day streak (most recent consecutive profitable trading days)
    const tradingDates = [...new Set(trades.map((t) => t.trade_date))].sort().reverse();
    let profitableStreak = 0;
    for (const d of tradingDates) {
      const dayPnl = trades.filter((t) => t.trade_date === d).reduce((s, t) => s + t.pnl_pips, 0);
      if (dayPnl > 0) profitableStreak++;
      else break;
    }

    // Rules followed streak (journals without mistakes)
    const sortedJournals = [...journals].sort((a, b) => b.journal_date.localeCompare(a.journal_date));
    let rulesStreak = 0;
    for (const j of sortedJournals) {
      if (!j.mistakes || j.mistakes.length === 0) rulesStreak++;
      else break;
    }

    // Today's readiness
    const todayJournal = journals.find((j) => j.journal_date === todayStr);

    return { journalStreak, profitableStreak, rulesStreak, todayJournal };
  }, [trades, journals]);

  // Achievements
  const badges = useMemo(() => {
    const list: { name: string; desc: string }[] = [];
    if (trades.length >= 1) list.push({ name: "First Trade Logged", desc: "Entered your first trade into The Chamber" });
    if (trades.length >= 10) list.push({ name: "10 Trades Logged", desc: "Building the habit — 10 trades tracked" });
    if (trades.length >= 50) list.push({ name: "50 Trade Veteran", desc: "Serious commitment — 50 trades analyzed" });
    if (trades.length >= 100) list.push({ name: "Century Club", desc: "100 trades in the books" });

    // First profitable week
    if (trades.length > 0) {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - dayOfWeek);
      for (let w = 0; w < 52; w++) {
        const ws = new Date(weekStart);
        ws.setDate(weekStart.getDate() - w * 7);
        const we = new Date(ws);
        we.setDate(ws.getDate() + 4);
        const wsStr = format(ws, "yyyy-MM-dd");
        const weStr = format(we, "yyyy-MM-dd");
        const weekTrades = trades.filter((t) => t.trade_date >= wsStr && t.trade_date <= weStr);
        if (weekTrades.length > 0 && weekTrades.reduce((s, t) => s + t.pnl_pips, 0) > 0) {
          list.push({ name: "First Profitable Week", desc: "Closed a full week in the green" });
          break;
        }
      }
    }

    if (streakData.journalStreak >= 7) list.push({ name: "7-Day Journal Streak", desc: "A full week of daily journaling" });
    if (trades.length >= 20 && winRate >= 60) list.push({ name: "Sniper", desc: "60%+ win rate across 20+ trades" });

    return list;
  }, [trades, winRate, streakData.journalStreak]);

  // Journal map for calendar display
  const journalMap = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const j of journals) map.set(j.journal_date, j);
    return map;
  }, [journals]);

  // ICT Concept of the Day
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const dailyConcept = ICT_CONCEPTS[dayOfYear % ICT_CONCEPTS.length];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-chamber-text-muted">Loading...</div>
      </div>
    );
  }

  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  // Donut SVG
  const circumference = 2 * Math.PI * 45;
  const winPct = trades.length ? winnersCount / trades.length : 0;
  const lossPct = trades.length ? losersCount / trades.length : 0;
  const winDash = winPct * circumference;
  const lossDash = lossPct * circumference;
  const lossOffset = -winDash;

  return (
    <div className="space-y-8">
      {/* Header */}
      <h1
        className="text-3xl font-bold tracking-[3px] text-chamber-orange"
        style={{ textShadow: "0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15)" }}
      >
        DASHBOARD
      </h1>

      {/* ============================================================ */}
      {/* TRADING CALENDAR */}
      {/* ============================================================ */}
      <section>
        <h2 className="text-xl font-bold text-white mb-1">Trading Calendar</h2>
        <p className="text-chamber-text-muted text-sm mb-4">Click a trading day to see details</p>

        {/* Monthly stat cards — 6 columns */}
        {(() => {
          const mDollar = monthTrades.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
          const mTotal = monthTrades.reduce((s, t) => s + t.pnl_pips, 0);
          const mTradingDays = new Set(monthTrades.map((t) => t.trade_date));
          const mWinDays = new Set<string>();
          const mLoseDays = new Set<string>();
          for (const d of mTradingDays) {
            const dp = monthTrades.filter((t) => t.trade_date === d).reduce((s, t) => s + t.pnl_pips, 0);
            if (dp > 0) mWinDays.add(d); else if (dp < 0) mLoseDays.add(d);
          }
          const mWins = monthTrades.filter((t) => t.pnl_pips > 0).length;
          const mWr = monthTrades.length ? (mWins / monthTrades.length) * 100 : 0;
          const mColor = mTotal > 0 ? "#22c55e" : mTotal < 0 ? "#ef4444" : "#a0a0a0";
          const mWrColor = mWr >= 55 ? "#22c55e" : mWr >= 45 ? "#e8651a" : "#ef4444";

          return (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
              <StatCard
                label="Monthly P&L"
                value={mDollar ? formatDollar(mDollar) : mTotal ? `${mTotal > 0 ? "+" : ""}${mTotal.toFixed(1)} pips` : "—"}
                color={mColor}
                subText={mDollar ? `${mTotal.toFixed(1)} pips` : ""}
              />
              <StatCard label="Total Trades" value={String(monthTrades.length)} />
              <StatCard label="Trading Days" value={String(mTradingDays.size)} color="#e8651a" />
              <StatCard label="Winning Days" value={String(mWinDays.size)} color="#22c55e" />
              <StatCard label="Losing Days" value={String(mLoseDays.size)} color="#ef4444" />
              <StatCard label="Win Rate" value={monthTrades.length ? `${mWr.toFixed(0)}%` : "—"} color={monthTrades.length ? mWrColor : "#a0a0a0"} />
            </div>
          );
        })()}

        {/* Month nav */}
        <div className="flex items-center mb-3">
          <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="px-2 py-1.5 md:px-4 md:py-2 rounded-lg bg-chamber-surface border border-chamber-border text-xs md:text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors">
            &lt; Prev
          </button>
          <span className="flex-1 text-center text-sm md:text-lg font-semibold text-white">{format(calMonth, "MMMM yyyy")}</span>
          <div className="flex gap-1.5 md:gap-2">
            <button onClick={() => setCalMonth(new Date())} className="hidden md:block px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors">
              Today
            </button>
            <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="px-2 py-1.5 md:px-4 md:py-2 rounded-lg bg-chamber-surface border border-chamber-border text-xs md:text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors">
              Next &gt;
            </button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-0.5 md:gap-1 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-[0.55rem] md:text-[0.7rem] text-chamber-text-muted uppercase tracking-wider py-1 md:py-1.5 font-semibold">
              <span className="hidden md:inline">{d}</span>
              <span className="md:hidden">{d[0]}</span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-0.5 md:gap-1">
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[65px] md:min-h-[90px] lg:min-h-[110px] 2xl:min-h-[130px]" />
          ))}
          {daysInMonth.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dp = dailyPnl[dateStr];
            const journal = journalMap.get(dateStr);
            const hasTradesDay = !!dp;
            const isCurrentDay = isToday(day);

            let bgClass = "bg-[#0e0e0e] border-chamber-border";
            let textColor = "text-chamber-text-dim";
            if (hasTradesDay) {
              if (dp.pips > 0) { bgClass = "bg-green-500/10 border-green-500/25"; textColor = "text-green-400"; }
              else if (dp.pips < 0) { bgClass = "bg-red-500/10 border-red-500/25"; textColor = "text-red-400"; }
            }

            return (
              <div
                key={dateStr}
                className={`min-h-[65px] md:min-h-[90px] lg:min-h-[110px] 2xl:min-h-[130px] rounded-md md:rounded-lg border p-0.5 md:p-1.5 flex flex-col items-center justify-center transition-all ${bgClass} ${
                  isCurrentDay ? "!border-chamber-orange !border-2 shadow-[0_0_8px_rgba(232,101,26,0.4)]" : ""
                } ${hasTradesDay || journal ? "cursor-pointer hover:bg-chamber-orange/10 hover:border-chamber-orange/40" : ""}`}
              >
                <span className={`text-[0.6rem] md:text-[0.7rem] ${isCurrentDay ? "text-white" : "text-chamber-text-muted"}`}>
                  {format(day, "d")}
                </span>
                {hasTradesDay && (
                  <>
                    {/* Mobile: show pips only (short); Desktop: show dollar/pips */}
                    <span className={`text-[0.6rem] font-bold leading-tight md:hidden ${textColor}`}>
                      {`${dp.pips > 0 ? "+" : ""}${dp.pips.toFixed(0)}p`}
                    </span>
                    <span className={`hidden md:block text-sm font-bold ${textColor}`}>
                      {dp.dollar ? formatDollar(dp.dollar) : `${dp.pips > 0 ? "+" : ""}${dp.pips.toFixed(0)}p`}
                    </span>
                    <span className="hidden md:block text-[0.65rem] text-chamber-text-muted">Trades: {dp.count}</span>
                  </>
                )}
                {/* Mental score dot — always visible; score text desktop-only */}
                {journal && (
                  <div className="flex items-center gap-0.5 md:gap-1 mt-0.5">
                    <span className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full flex-shrink-0" style={{ background: journal.readiness_score >= 7 ? "#22c55e" : journal.readiness_score >= 4 ? "#e8651a" : "#ef4444" }} />
                    <span className="hidden md:inline text-[0.5rem]" style={{ color: journal.readiness_score >= 7 ? "#22c55e" : journal.readiness_score >= 4 ? "#e8651a" : "#ef4444" }}>
                      {journal.readiness_score}/10
                    </span>
                  </div>
                )}
                {journal && !hasTradesDay && (
                  <span className="hidden md:block text-[0.5rem] text-chamber-text-dim mt-0.5">✎ Journal</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-5 justify-center mt-3 flex-wrap">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-500/30 border border-green-500" /><span className="text-[0.7rem] text-chamber-text-muted">Profit</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500/30 border border-red-500" /><span className="text-[0.7rem] text-chamber-text-muted">Loss</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-chamber-orange" /><span className="text-[0.7rem] text-chamber-text-muted">Mental Score</span></div>
          <div className="flex items-center gap-1.5"><span className="text-[0.7rem] text-chamber-orange">✎</span><span className="text-[0.7rem] text-chamber-text-muted">Journal Entry</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border-2 border-chamber-orange shadow-[0_0_6px_rgba(232,101,26,0.5)]" /><span className="text-[0.7rem] text-chamber-text-muted">Today</span></div>
        </div>
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* STATS OVERVIEW */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-1"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          STATS OVERVIEW
        </h2>
        <p className="text-chamber-text-muted text-sm mb-4">Your all-time trading performance at a glance</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <StatCard label="Net P&L" value={stats ? formatDollar(stats.totalDollar) : "—"} color={stats ? (stats.totalDollar > 0 ? "#22c55e" : stats.totalDollar < 0 ? "#ef4444" : "#888") : "#f5f5f5"} />
          <StatCard label="Win Rate" value={stats ? `${stats.winRate.toFixed(1)}%` : "—"} color={stats ? wrColor : "#ef4444"} subText={stats ? `${stats.winners}W / ${stats.losers}L` : "No trades yet"} />
          <StatCard label="Profit Factor" value={stats && stats.pf > 0 ? stats.pf.toFixed(2) : "—"} color={stats ? (stats.pf > 1.5 ? "#22c55e" : stats.pf > 1 ? "#e8651a" : "#ef4444") : "#22c55e"} />
          <StatCard label="Max Drawdown" value={stats ? formatDollar(stats.maxDd) : "—"} color="#ef4444" subText={stats ? "from peak" : ""} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Trades" value={stats ? String(trades.length) : "0"} subText={stats ? `${stats.tradingDays} days` : ""} />
          <StatCard label="Avg Win" value={stats ? formatDollar(stats.avgWin) : "—"} color="#22c55e" />
          <StatCard label="Avg Loss" value={stats ? formatDollar(stats.avgLoss) : "—"} color="#ef4444" />
          <StatCard label="R:R Ratio" value={stats && stats.rr > 0 ? stats.rr.toFixed(2) : "—"} color={stats ? (stats.rr >= 2 ? "#22c55e" : stats.rr >= 1 ? "#e8651a" : "#ef4444") : "#ef4444"} />
          <StatCard label="Current P&L" value={stats ? formatDollar(stats.running) : "—"} color={stats ? (stats.running > 0 ? "#22c55e" : "#ef4444") : "#ef4444"} />
        </div>
      </section>

      {/* ============================================================ */}
      {/* DONUT + PERFORMANCE CHART (side by side) */}
      {/* ============================================================ */}
      <section>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Donut */}
          <div className="lg:col-span-1 flex justify-center items-start">
            <div className="text-center py-2">
              <svg viewBox="0 0 120 120" width="180" height="180">
                <circle cx="60" cy="60" r="45" fill="none" stroke="#1e1a17" strokeWidth="12" />
                {trades.length > 0 && (
                  <>
                    <circle cx="60" cy="60" r="45" fill="none" stroke="#22c55e" strokeWidth="12"
                      strokeDasharray={`${winDash} ${circumference}`} strokeDashoffset="0"
                      transform="rotate(-90 60 60)" strokeLinecap="round" />
                    <circle cx="60" cy="60" r="45" fill="none" stroke="#ef4444" strokeWidth="12"
                      strokeDasharray={`${lossDash} ${circumference}`} strokeDashoffset={`${lossOffset}`}
                      transform="rotate(-90 60 60)" strokeLinecap="round" />
                  </>
                )}
                <text x="60" y="55" textAnchor="middle" fill={trades.length ? wrColor : "#888"} fontSize="18" fontWeight="700">
                  {trades.length ? `${winRate.toFixed(0)}%` : "—"}
                </text>
                <text x="60" y="72" textAnchor="middle" fill="#888" fontSize="8">WIN RATE</text>
              </svg>
              <div className="flex justify-center gap-3 mt-1">
                <span className="text-chamber-green text-xs">&#9679; {winnersCount}W</span>
                <span className="text-chamber-red text-xs">&#9679; {losersCount}L</span>
              </div>
            </div>
          </div>

          {/* Equity Curve */}
          <div className="lg:col-span-3">
            <h2 className="text-lg font-bold text-white mb-3">Performance Chart</h2>
            {equityData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData}>
                    <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#888", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#141414", border: "1px solid #1e1a17", borderRadius: 8 }}
                      labelStyle={{ color: "#888" }}
                      itemStyle={{ color: "#e8651a" }}
                    />
                    <Line type="monotone" dataKey="pnl" stroke="#e8651a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="bg-chamber-surface border border-chamber-border rounded-lg p-10 text-center text-chamber-text-muted">
                Your equity curve will appear here once you log trades.
              </div>
            )}
          </div>
        </div>
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* RECENT TRADES + STREAKS (side by side) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Recent Trades */}
        <div className="lg:col-span-3">
          <h2
            className="text-lg font-bold tracking-wider text-chamber-orange mb-3"
            style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
          >
            RECENT TRADES
          </h2>
          {trades.length > 0 ? (
            <div className="space-y-0">
              {trades.slice(0, 10).map((t) => (
                <div key={t.id} className="flex justify-between items-center py-2 px-2 border-b border-[#1a1a1a]">
                  <div>
                    <span className="text-chamber-text-muted text-[0.75rem] mr-2">{t.trade_date}</span>
                    <strong className="text-white">{t.pair}</strong>
                    <span className="text-chamber-text-muted text-sm ml-2 uppercase">{t.direction}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold" style={{ color: t.pnl_pips > 0 ? "#22c55e" : t.pnl_pips < 0 ? "#ef4444" : "#888" }}>
                      {t.pnl_dollar ? formatDollar(t.pnl_dollar) : ""}
                    </span>
                    <span className="text-[0.75rem] ml-1" style={{ color: t.pnl_pips > 0 ? "#22c55e" : t.pnl_pips < 0 ? "#ef4444" : "#888" }}>
                      {t.pnl_pips > 0 ? "W" : t.pnl_pips < 0 ? "L" : "BE"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-chamber-surface border border-chamber-border rounded-lg p-8 text-center text-chamber-text-muted">
              No trades logged yet. Your recent trades will show here.
            </div>
          )}
        </div>

        {/* Streaks */}
        <div className="lg:col-span-2">
          <h2
            className="text-lg font-bold tracking-wider text-chamber-orange mb-3"
            style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
          >
            STREAKS
          </h2>
          <div className="grid grid-cols-1 gap-1.5">
            <StatCard
              label="Journal Streak"
              value={`${streakData.journalStreak} days`}
              color={streakData.journalStreak >= 3 ? "#e8651a" : "#888"}
            />
            <StatCard
              label="Profitable Day Streak"
              value={`${streakData.profitableStreak} days`}
              color={streakData.profitableStreak >= 3 ? "#22c55e" : "#888"}
            />
            <StatCard
              label="Rules Followed Streak"
              value={`${streakData.rulesStreak} days`}
              color={streakData.rulesStreak >= 3 ? "#22c55e" : "#888"}
            />
            {streakData.todayJournal ? (
              <StatCard
                label="Today's Readiness"
                value={`${streakData.todayJournal.readiness_score}/10`}
                color={streakData.todayJournal.readiness_score >= 7 ? "#22c55e" : streakData.todayJournal.readiness_score >= 4 ? "#e8651a" : "#ef4444"}
                subText={streakData.todayJournal.readiness_label || ""}
              />
            ) : (
              <StatCard label="Today's Readiness" value="—" color="#888" subText="Fill out journal" />
            )}
          </div>
        </div>
      </div>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* ACHIEVEMENTS */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-lg font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          ACHIEVEMENTS
        </h2>
        {badges.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {badges.map((b) => (
              <div key={b.name} className="text-center p-3 bg-chamber-surface border border-chamber-orange/20 rounded-lg">
                <div className="text-2xl mb-1">&#x1F3C6;</div>
                <div className="text-chamber-orange font-semibold text-sm">{b.name}</div>
                <div className="text-chamber-text-muted text-[0.7rem]">{b.desc}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 text-center text-chamber-text-muted">
            Complete milestones to earn badges! Start by logging your first trade.
          </div>
        )}
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* ICT CONCEPT OF THE DAY */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-lg font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          ICT CONCEPT OF THE DAY
        </h2>
        <div
          className="bg-chamber-surface border rounded-lg p-5 relative overflow-hidden"
          style={{ borderColor: `${dailyConcept.color}33` }}
        >
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${dailyConcept.color}, transparent)` }} />
          <div className="flex items-center gap-2.5 mb-3">
            <span className="font-bold text-lg" style={{ color: dailyConcept.color }}>{dailyConcept.title}</span>
            <span
              className="text-[0.6rem] font-bold tracking-wider px-2 py-0.5 rounded border"
              style={{ color: dailyConcept.color, borderColor: `${dailyConcept.color}33`, background: `${dailyConcept.color}10` }}
            >
              DAY {dayOfYear}
            </span>
          </div>
          <p className="text-[#ccc] text-[0.88rem] leading-relaxed mb-3">{dailyConcept.concept}</p>
          <div className="rounded-md p-2.5 border" style={{ background: `${dailyConcept.color}08`, borderColor: `${dailyConcept.color}22` }}>
            <span className="font-bold text-[0.75rem] tracking-wider" style={{ color: dailyConcept.color }}>TIP: </span>
            <span className="text-[#999] text-[0.82rem]">{dailyConcept.tip}</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-[#333] text-[0.65rem] tracking-wider">BASED ON ICT CONCEPTS · TRAINED ON 675+ ICT YOUTUBE TRANSCRIPTS</p>
        <p className="text-[#292929] text-[0.58rem] mt-1">THIS IS NOT FINANCIAL ADVICE</p>
      </div>
    </div>
  );
}
