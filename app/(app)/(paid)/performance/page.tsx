"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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

// ============================================================
// Time Range helpers
// ============================================================
type RangeKey = "This Month" | "Last Month" | "This Week" | "Last 30 Days" | "Last 90 Days" | "Year to Date" | "All Time";

function getDateRange(key: RangeKey): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const end = fmt(today);

  switch (key) {
    case "This Month": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmt(s), end };
    }
    case "Last Month": {
      const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastPrev = new Date(firstThis.getTime() - 86400000);
      const s = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
      return { start: fmt(s), end: fmt(lastPrev) };
    }
    case "This Week": {
      const day = today.getDay();
      const s = new Date(today);
      s.setDate(today.getDate() - day);
      return { start: fmt(s), end };
    }
    case "Last 30 Days": {
      const s = new Date(today);
      s.setDate(today.getDate() - 30);
      return { start: fmt(s), end };
    }
    case "Last 90 Days": {
      const s = new Date(today);
      s.setDate(today.getDate() - 90);
      return { start: fmt(s), end };
    }
    case "Year to Date": {
      const s = new Date(today.getFullYear(), 0, 1);
      return { start: fmt(s), end };
    }
    default: // All Time
      return { start: "2020-01-01", end };
  }
}

const RANGE_OPTIONS: RangeKey[] = [
  "This Month", "Last Month", "This Week", "Last 30 Days", "Last 90 Days", "Year to Date", "All Time",
];

// ============================================================
// Donut SVG component
// ============================================================
function WinRateDonut({ winRate, winners, losers, breakeven }: {
  winRate: number; winners: number; losers: number; breakeven: number;
}) {
  const total = winners + losers + breakeven;
  const winPct = total > 0 ? winners / total : 0;
  const lossPct = total > 0 ? losers / total : 0;
  const circumference = 2 * Math.PI * 45;
  const winDash = winPct * circumference;
  const lossDash = lossPct * circumference;
  const lossOffset = -winDash;
  const hasTrades = total > 0;
  const centerText = hasTrades ? `${winRate.toFixed(0)}%` : "—";
  const wrColor = winRate >= 55 ? "#22c55e" : winRate >= 45 ? "#e8651a" : "#ef4444";
  const centerColor = hasTrades ? wrColor : "#888";

  return (
    <div className="text-center py-3">
      <svg viewBox="0 0 120 120" width="200" height="200">
        <circle cx="60" cy="60" r="45" fill="none" stroke="#1e1a17" strokeWidth="12" />
        {hasTrades && (
          <>
            <circle cx="60" cy="60" r="45" fill="none" stroke="#22c55e" strokeWidth="12"
              strokeDasharray={`${winDash} ${circumference}`} strokeDashoffset="0"
              transform="rotate(-90 60 60)" strokeLinecap="round" />
            <circle cx="60" cy="60" r="45" fill="none" stroke="#ef4444" strokeWidth="12"
              strokeDasharray={`${lossDash} ${circumference}`} strokeDashoffset={`${lossOffset}`}
              transform="rotate(-90 60 60)" strokeLinecap="round" />
          </>
        )}
        <text x="60" y="55" textAnchor="middle" fill={centerColor} fontSize="18" fontWeight="700">{centerText}</text>
        <text x="60" y="72" textAnchor="middle" fill="#888" fontSize="8">WIN RATE</text>
      </svg>
      <div className="flex justify-center gap-4 mt-2">
        <span className="text-chamber-green text-xs">&#9679; {winners} Wins</span>
        <span className="text-chamber-red text-xs">&#9679; {losers} Losses</span>
        {breakeven > 0 && <span className="text-chamber-text-muted text-xs">&#9679; {breakeven} BE</span>}
      </div>
    </div>
  );
}

// ============================================================
// Main Performance Page
// ============================================================
export default function PerformancePage() {
  const supabase = createClient();
  const router = useRouter();
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [allJournals, setAllJournals] = useState<JournalEntry[]>([]);
  const [selectedRange, setSelectedRange] = useState<RangeKey>("This Month");
  const [activeTab, setActiveTab] = useState<"calendar" | "equity" | "breakdowns" | "streaks" | "mental">("calendar");
  const [breakdownType, setBreakdownType] = useState<"Pair" | "Direction" | "Day of Week">("Pair");
  const [loading, setLoading] = useState(true);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [tradesRes, journalsRes] = await Promise.all([
        supabase.from("trades").select("*").eq("user_id", user.id).order("trade_date", { ascending: false }).limit(5000),
        supabase.from("journal_entries").select("*").eq("user_id", user.id),
      ]);
      setAllTrades((tradesRes.data as Trade[]) || []);
      setAllJournals((journalsRes.data as JournalEntry[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  // Filter trades by selected range
  const { start, end } = useMemo(() => getDateRange(selectedRange), [selectedRange]);

  const trades = useMemo(
    () => allTrades.filter((t) => t.trade_date >= start && t.trade_date <= end),
    [allTrades, start, end]
  );

  const journals = useMemo(
    () => allJournals.filter((j) => j.journal_date >= start && j.journal_date <= end),
    [allJournals, start, end]
  );

  // ============================================================
  // Compute stats
  // ============================================================
  const stats = useMemo(() => {
    const winners = trades.filter((t) => t.pnl_pips > 0);
    const losers = trades.filter((t) => t.pnl_pips < 0);
    const breakeven = trades.filter((t) => t.pnl_pips === 0);
    const totalDollar = trades.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
    const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
    const avgWinDollar = winners.length ? winners.reduce((s, t) => s + (t.pnl_dollar || 0), 0) / winners.length : 0;
    const avgLossDollar = losers.length ? losers.reduce((s, t) => s + (t.pnl_dollar || 0), 0) / losers.length : 0;
    const grossWinPips = winners.reduce((s, t) => s + t.pnl_pips, 0);
    const grossLossPips = Math.abs(losers.reduce((s, t) => s + t.pnl_pips, 0));
    const profitFactor = grossLossPips > 0 ? grossWinPips / grossLossPips : 0;
    const rrRatio = avgLossDollar !== 0 ? Math.abs(avgWinDollar / avgLossDollar) : 0;
    const bestTrade = trades.length ? trades.reduce((best, t) => (t.pnl_dollar || 0) > (best.pnl_dollar || 0) ? t : best, trades[0]) : null;
    const worstTrade = trades.length ? trades.reduce((worst, t) => (t.pnl_dollar || 0) < (worst.pnl_dollar || 0) ? t : worst, trades[0]) : null;

    // Trading days
    const tradingDaysSet = new Set(trades.map((t) => t.trade_date));
    const winningDays = new Set<string>();
    const losingDays = new Set<string>();
    for (const d of tradingDaysSet) {
      const dayPnl = trades.filter((t) => t.trade_date === d).reduce((s, t) => s + (t.pnl_dollar || 0), 0);
      if (dayPnl > 0) winningDays.add(d);
      else if (dayPnl < 0) losingDays.add(d);
    }

    return {
      winners: winners.length,
      losers: losers.length,
      breakeven: breakeven.length,
      totalDollar,
      winRate,
      avgWinDollar,
      avgLossDollar,
      profitFactor,
      rrRatio,
      bestTrade,
      worstTrade,
      tradingDays: tradingDaysSet.size,
      winningDays: winningDays.size,
      losingDays: losingDays.size,
      tradingDaysSet,
      winningDaysSet: winningDays,
      losingDaysSet: losingDays,
    };
  }, [trades]);

  // Color helpers
  const pnlColor = stats.totalDollar > 0 ? "#22c55e" : stats.totalDollar < 0 ? "#ef4444" : "#a0a0a0";
  const wrColor = stats.winRate >= 55 ? "#22c55e" : stats.winRate >= 45 ? "#e8651a" : "#ef4444";
  const pfColor = stats.profitFactor > 1.5 ? "#22c55e" : stats.profitFactor > 1 ? "#e8651a" : "#ef4444";
  const rrColor = stats.rrRatio >= 2 ? "#22c55e" : stats.rrRatio >= 1 ? "#e8651a" : "#ef4444";

  // Day stats
  const avgTradesPerDay = stats.tradingDays > 0 ? trades.length / stats.tradingDays : 0;
  const avgDollarPerDay = stats.tradingDays > 0 ? stats.totalDollar / stats.tradingDays : 0;
  const dayWinRate = stats.tradingDays > 0 ? (stats.winningDays / stats.tradingDays) * 100 : 0;

  // ============================================================
  // Equity Curve data
  // ============================================================
  const equityData = useMemo(() => {
    if (!trades.length) return [];
    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date) || (a.id || "").localeCompare(b.id || ""));
    let running = 0;
    const points: { date: string; equity: number }[] = [];
    for (const t of sorted) {
      running += t.pnl_dollar || 0;
      points.push({ date: t.trade_date, equity: Math.round(running * 100) / 100 });
    }
    return points;
  }, [trades]);

  const equityStats = useMemo(() => {
    if (!equityData.length) return { peak: 0, maxDD: 0, current: 0 };
    let peak = 0, maxDD = 0;
    for (const p of equityData) {
      if (p.equity > peak) peak = p.equity;
      const dd = peak - p.equity;
      if (dd > maxDD) maxDD = dd;
    }
    return { peak, maxDD, current: equityData[equityData.length - 1].equity };
  }, [equityData]);

  // ============================================================
  // Breakdowns data
  // ============================================================
  const breakdowns = useMemo(() => {
    if (!trades.length) return [];
    const groups: Record<string, Trade[]> = {};
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    for (const t of trades) {
      let key: string;
      if (breakdownType === "Pair") key = t.pair;
      else if (breakdownType === "Direction") key = t.direction.toUpperCase();
      else {
        const d = new Date(t.trade_date + "T00:00:00");
        key = dayNames[d.getDay()] || "Unknown";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }

    return Object.entries(groups)
      .map(([name, gTrades]) => {
        const dollar = gTrades.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
        const wins = gTrades.filter((t) => t.pnl_pips > 0).length;
        const wr = gTrades.length > 0 ? (wins / gTrades.length) * 100 : 0;
        const avg = gTrades.length > 0 ? dollar / gTrades.length : 0;
        return { name, trades: gTrades.length, dollar, winRate: wr, avgPnl: avg };
      })
      .sort((a, b) => {
        if (breakdownType === "Day of Week") {
          const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
          return order.indexOf(a.name) - order.indexOf(b.name);
        }
        return b.dollar - a.dollar;
      });
  }, [trades, breakdownType]);

  // ============================================================
  // Streaks data
  // ============================================================
  const streaks = useMemo(() => {
    if (!trades.length) return { maxWin: 0, maxLoss: 0, currentStreak: 0, currentType: "" as string, maxDayWin: 0, maxDayLoss: 0, dayStreak: 0, dayType: "" as string };

    const sorted = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date) || (a.id || "").localeCompare(b.id || ""));

    let currentStreak = 0, currentType = "", maxWin = 0, maxLoss = 0;
    for (const t of sorted) {
      if (t.pnl_pips > 0) {
        if (currentType === "win") currentStreak++;
        else { currentType = "win"; currentStreak = 1; }
        maxWin = Math.max(maxWin, currentStreak);
      } else if (t.pnl_pips < 0) {
        if (currentType === "loss") currentStreak++;
        else { currentType = "loss"; currentStreak = 1; }
        maxLoss = Math.max(maxLoss, currentStreak);
      }
    }

    // Daily streaks
    const sortedDates = [...stats.tradingDaysSet].sort();
    let dayStreak = 0, dayType = "", maxDayWin = 0, maxDayLoss = 0;
    for (const d of sortedDates) {
      const dayPnl = trades.filter((t) => t.trade_date === d).reduce((s, t) => s + (t.pnl_dollar || 0), 0);
      if (dayPnl > 0) {
        if (dayType === "win") dayStreak++;
        else { dayType = "win"; dayStreak = 1; }
        maxDayWin = Math.max(maxDayWin, dayStreak);
      } else if (dayPnl < 0) {
        if (dayType === "loss") dayStreak++;
        else { dayType = "loss"; dayStreak = 1; }
        maxDayLoss = Math.max(maxDayLoss, dayStreak);
      }
    }

    return { maxWin, maxLoss, currentStreak, currentType, maxDayWin, maxDayLoss, dayStreak, dayType };
  }, [trades, stats.tradingDaysSet]);

  // ============================================================
  // Mental Correlation data
  // ============================================================
  const mentalData = useMemo(() => {
    if (!journals.length || !trades.length) return null;

    const journalMap = new Map(journals.map((j) => [j.journal_date, j]));
    const correlations: Array<{
      date: string; pnl: number; trades: number; winRate: number;
      readiness: number; sleep: number; energy: number; focus: number;
      mood: number; stress: number; confidence: number;
    }> = [];

    for (const d of stats.tradingDaysSet) {
      const j = journalMap.get(d);
      if (!j) continue;
      const dayTrades = trades.filter((t) => t.trade_date === d);
      const dayDollar = dayTrades.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
      const dayWins = dayTrades.filter((t) => t.pnl_pips > 0).length;
      correlations.push({
        date: d,
        pnl: dayDollar,
        trades: dayTrades.length,
        winRate: dayTrades.length > 0 ? (dayWins / dayTrades.length) * 100 : 0,
        readiness: j.readiness_score,
        sleep: j.sleep,
        energy: j.energy,
        focus: j.focus,
        mood: j.mood,
        stress: j.stress,
        confidence: j.confidence,
      });
    }

    if (!correlations.length) return null;

    const highReady = correlations.filter((c) => c.readiness >= 7);
    const lowReady = correlations.filter((c) => c.readiness <= 4);

    const categories = ["sleep", "energy", "focus", "mood", "stress", "confidence"] as const;
    const catBreakdown = categories.map((cat) => {
      const high = correlations.filter((c) => c[cat] >= 7);
      const low = correlations.filter((c) => c[cat] <= 4);
      if (!high.length || !low.length) return null;
      const hPnl = high.reduce((s, c) => s + c.pnl, 0) / high.length;
      const lPnl = low.reduce((s, c) => s + c.pnl, 0) / low.length;
      return { cat: cat.charAt(0).toUpperCase() + cat.slice(1), highCount: high.length, lowCount: low.length, hPnl, lPnl, diff: hPnl - lPnl };
    }).filter(Boolean) as Array<{ cat: string; highCount: number; lowCount: number; hPnl: number; lPnl: number; diff: number }>;

    return {
      count: correlations.length,
      highReady,
      lowReady,
      catBreakdown,
    };
  }, [trades, journals, stats.tradingDaysSet]);

  // ============================================================
  // Calendar helpers
  // ============================================================
  const calendarData = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    // Build day map from ALL trades (not filtered)
    const dayMap = new Map<string, { pnl: number; count: number; trades: Trade[] }>();
    for (const t of allTrades) {
      const existing = dayMap.get(t.trade_date) || { pnl: 0, count: 0, trades: [] };
      existing.pnl += t.pnl_dollar || 0;
      existing.count++;
      existing.trades.push(t);
      dayMap.set(t.trade_date, existing);
    }

    const days: Array<{ date: string; day: number; pnl: number; count: number; trades: Trade[]; isToday: boolean } | null> = [];
    // Padding
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const info = dayMap.get(dateStr);
      const today = new Date();
      const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
      days.push({ date: dateStr, day: d, pnl: info?.pnl || 0, count: info?.count || 0, trades: info?.trades || [], isToday });
    }
    return days;
  }, [calMonth, allTrades]);

  const calMonthLabel = calMonth.toLocaleString("default", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-chamber-text-muted">Loading performance data...</div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1" style={{ color: "#e8651a", textShadow: "0 0 20px rgba(232,101,26,0.4)", letterSpacing: "2px" }}>
        PERFORMANCE & ANALYTICS
      </h1>

      {/* Time Range Selector */}
      <div className="flex flex-wrap gap-2 my-4">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setSelectedRange(opt)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{
              background: selectedRange === opt ? "#e8651a" : "#141414",
              color: selectedRange === opt ? "#fff" : "#888",
              border: `1px solid ${selectedRange === opt ? "#e8651a" : "#1e1a17"}`,
            }}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Stats — Dashboard style compact summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
        <StatCard label="Net P&L" value={trades.length ? formatDollar(stats.totalDollar) : "—"} color={pnlColor} />
        <StatCard label="Win Rate" value={trades.length ? `${stats.winRate.toFixed(1)}%` : "—"} color={wrColor} subText={trades.length ? `${stats.winners}W / ${stats.losers}L` : ""} />
        <StatCard label="Profit Factor" value={stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : "—"} color={pfColor} />
        <StatCard label="Trades" value={String(trades.length)} subText={trades.length ? `${stats.tradingDays} days` : ""} />
        <StatCard label="Avg Win" value={stats.winners > 0 ? formatDollar(stats.avgWinDollar) : "—"} color="#22c55e" />
        <StatCard label="Avg Loss" value={stats.losers > 0 ? formatDollar(stats.avgLossDollar) : "—"} color="#ef4444" />
      </div>

      {/* Donut + Day Performance — compact */}
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 my-4">
        <div className="flex items-center justify-center">
          <WinRateDonut winRate={stats.winRate} winners={stats.winners} losers={stats.losers} breakeven={stats.breakeven} />
        </div>
        <div>
          <p className="font-bold mb-2 text-sm text-chamber-orange tracking-wide">Day Performance</p>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Winning Days" value={String(stats.winningDays)} color="#22c55e" />
            <StatCard label="Losing Days" value={String(stats.losingDays)} color="#ef4444" />
            <StatCard label="Total Days" value={String(stats.tradingDays)} />
            <StatCard label="Avg Trades/Day" value={avgTradesPerDay > 0 ? avgTradesPerDay.toFixed(1) : "—"} color="#e8651a" />
            <StatCard label="Avg $/Day" value={trades.length ? formatDollar(avgDollarPerDay) : "—"} color={avgDollarPerDay > 0 ? "#22c55e" : "#ef4444"} />
            <StatCard label="Day Win Rate" value={trades.length ? `${dayWinRate.toFixed(0)}%` : "—"} color={dayWinRate >= 55 ? "#22c55e" : dayWinRate >= 45 ? "#e8651a" : "#ef4444"} />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-chamber-border my-4" />

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {([
          ["calendar", "Calendar"],
          ["equity", "Equity Curve"],
          ["breakdowns", "Breakdowns"],
          ["streaks", "Streaks"],
          ["mental", "Mental Correlation"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-4 py-2 text-sm font-medium rounded-t-md whitespace-nowrap transition-colors"
            style={{
              background: activeTab === key ? "#141414" : "transparent",
              color: activeTab === key ? "#e8651a" : "#888",
              borderBottom: activeTab === key ? "2px solid #e8651a" : "2px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* CALENDAR TAB */}
      {/* ============================================================ */}
      {activeTab === "calendar" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))}
              className="px-3 py-1.5 text-sm rounded-md bg-chamber-surface border border-chamber-border text-chamber-text-muted hover:text-chamber-text">
              &lt; Prev
            </button>
            <span className="text-lg font-semibold">{calMonthLabel}</span>
            <div className="flex gap-2">
              <button onClick={() => setCalMonth(new Date())}
                className="px-3 py-1.5 text-sm rounded-md bg-chamber-surface border border-chamber-border text-chamber-text-muted hover:text-chamber-text">
                Today
              </button>
              <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))}
                className="px-3 py-1.5 text-sm rounded-md bg-chamber-surface border border-chamber-border text-chamber-text-muted hover:text-chamber-text">
                Next &gt;
              </button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-xs text-chamber-text-muted mb-2">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 md:gap-1">
            {calendarData.map((cell, i) => {
              if (!cell) return <div key={i} className="min-h-[65px] md:min-h-[90px] lg:min-h-[110px]" />;
              const isSelected = selectedDay === cell.date;
              const hasTrades = cell.count > 0;
              let bgClass = "bg-[#0e0e0e] border-chamber-border";
              let textColor = "text-chamber-text-dim";
              if (hasTrades) {
                if (cell.pnl > 0) { bgClass = "bg-green-500/10 border-green-500/25"; textColor = "text-green-400"; }
                else if (cell.pnl < 0) { bgClass = "bg-red-500/10 border-red-500/25"; textColor = "text-red-400"; }
              }
              return (
                <div key={i}
                  onClick={() => hasTrades && setSelectedDay(isSelected ? null : cell.date)}
                  className={`min-h-[65px] md:min-h-[90px] lg:min-h-[110px] rounded-md md:rounded-lg border p-0.5 md:p-1.5 flex flex-col items-center justify-center transition-all ${bgClass} ${
                    cell.isToday ? "!border-chamber-orange !border-2 shadow-[0_0_8px_rgba(232,101,26,0.4)]" : ""
                  } ${isSelected ? "!border-chamber-orange ring-1 ring-chamber-orange" : ""} ${hasTrades ? "cursor-pointer hover:bg-chamber-orange/10 hover:border-chamber-orange/40" : ""}`}
                >
                  <span className={`text-[0.6rem] md:text-[0.7rem] ${cell.isToday ? "text-white font-bold" : "text-chamber-text-muted"}`}>
                    {cell.day}
                  </span>
                  {hasTrades && (
                    <>
                      <span className={`text-sm md:text-base font-bold ${textColor}`}>
                        {formatDollar(cell.pnl)}
                      </span>
                      <span className="text-[0.6rem] md:text-[0.65rem] text-chamber-text-muted">Trades: {cell.count}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected Day Detail Panel */}
          {selectedDay && (() => {
            const dayInfo = calendarData.find((c) => c && c.date === selectedDay);
            if (!dayInfo || !dayInfo.count) return null;
            const dayDate = new Date(selectedDay + "T12:00:00");
            return (
              <div className="mt-4 rounded-lg border border-chamber-orange/30 bg-[#0e0e0e] p-4 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-chamber-orange font-bold tracking-wide text-sm">
                    {dayDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </h3>
                  <button onClick={() => setSelectedDay(null)} className="text-chamber-text-muted hover:text-white text-xs">✕ Close</button>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className={dayInfo.pnl >= 0 ? "text-green-400" : "text-red-400"}>
                    P&L: {formatDollar(dayInfo.pnl)}
                  </span>
                  <span className="text-chamber-text-muted">{dayInfo.count} trade{dayInfo.count !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-1.5">
                  {dayInfo.trades.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded bg-[#141414] border border-chamber-border px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${t.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                          {t.direction?.toUpperCase()}
                        </span>
                        <span className="text-white font-medium">{t.pair}</span>
                        <span className="text-chamber-text-muted text-xs">@ {t.entry_price}</span>
                        <span className="text-chamber-text-dim text-xs">→ {t.exit_price}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${(t.pnl_dollar || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {formatDollar(t.pnl_dollar || 0)}
                        </span>
                        <span className="text-chamber-text-muted text-xs">
                          {t.pnl_pips > 0 ? "+" : ""}{t.pnl_pips.toFixed(1)}p
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const params = new URLSearchParams({
                              pair: t.pair || "", direction: t.direction || "",
                              entry_price: String(t.entry_price || ""), exit_price: String(t.exit_price || ""),
                              trade_date: t.trade_date || "", reasoning: t.reasoning || "",
                            });
                            router.push(`/ai-analysis?${params.toString()}`);
                          }}
                          className="px-2 py-0.5 rounded text-xs font-medium bg-chamber-orange/20 text-chamber-orange hover:bg-chamber-orange/40 transition-colors"
                        >
                          Analyze
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex justify-center gap-6 mt-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/30 border border-green-500 inline-block" /> Profit</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/30 border border-red-500 inline-block" /> Loss</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block border-2 border-chamber-orange shadow-[0_0_6px_rgba(232,101,26,0.5)]" /> Today</span>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* EQUITY CURVE TAB */}
      {/* ============================================================ */}
      {activeTab === "equity" && (
        <div>
          <h2 className="text-lg font-bold mb-4">Equity Curve</h2>
          {equityData.length > 0 ? (
            <>
              <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData}>
                    <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#1e1a17" }} />
                    <YAxis tick={{ fill: "#888", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#1e1a17" }}
                      tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#141414", border: "1px solid #1e1a17", borderRadius: "8px", color: "#f5f5f5", fontSize: "0.8rem" }}
                      formatter={(value) => [formatDollar(value as number), "P&L"]}
                    />
                    <Line type="monotone" dataKey="equity" stroke="#e8651a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Peak P&L" value={formatDollar(equityStats.peak)} color="#22c55e" />
                <StatCard label="Max Drawdown" value={formatDollar(equityStats.maxDD)} color="#ef4444" />
                <StatCard label="Current P&L" value={formatDollar(equityStats.current)} color={equityStats.current > 0 ? "#22c55e" : "#ef4444"} />
              </div>
            </>
          ) : (
            <div className="bg-chamber-surface border border-chamber-border rounded-lg p-10 text-center text-chamber-text-dim text-sm">
              Your equity curve will appear here once you log trades.
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* BREAKDOWNS TAB */}
      {/* ============================================================ */}
      {activeTab === "breakdowns" && (
        <div>
          <h2 className="text-lg font-bold mb-4">Performance Breakdowns</h2>
          {trades.length > 0 ? (
            <>
              <div className="flex gap-2 mb-4">
                {(["Pair", "Direction", "Day of Week"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setBreakdownType(opt)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: breakdownType === opt ? "#e8651a" : "#141414",
                      color: breakdownType === opt ? "#fff" : "#888",
                      border: `1px solid ${breakdownType === opt ? "#e8651a" : "#1e1a17"}`,
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {breakdowns.map((b) => {
                  const color = b.dollar > 0 ? "#22c55e" : b.dollar < 0 ? "#ef4444" : "#888";
                  return (
                    <details key={b.name} className="bg-chamber-surface border border-chamber-border rounded-lg">
                      <summary className="px-4 py-3 cursor-pointer flex justify-between items-center text-sm hover:bg-[#1a1a1a] rounded-lg">
                        <span className="font-bold">{b.name}</span>
                        <span>
                          <span style={{ color }} className="font-bold">{formatDollar(b.dollar)}</span>
                          <span className="text-chamber-text-muted ml-2">({b.trades} trades)</span>
                        </span>
                      </summary>
                      <div className="px-4 pb-4">
                        <div className="grid grid-cols-4 gap-2">
                          <StatCard label="P&L" value={formatDollar(b.dollar)} color={color} />
                          <StatCard label="Trades" value={String(b.trades)} />
                          <StatCard
                            label="Win Rate"
                            value={`${b.winRate.toFixed(0)}%`}
                            color={b.winRate >= 55 ? "#22c55e" : b.winRate >= 45 ? "#e8651a" : "#ef4444"}
                          />
                          <StatCard
                            label="Avg P&L"
                            value={formatDollar(b.avgPnl)}
                            color={b.avgPnl > 0 ? "#22c55e" : "#ef4444"}
                          />
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="bg-chamber-surface border border-chamber-border rounded-lg p-10 text-center text-chamber-text-dim text-sm">
              Log trades to see performance breakdowns by pair, direction, and day of week.
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* STREAKS TAB */}
      {/* ============================================================ */}
      {activeTab === "streaks" && (
        <div>
          <h2 className="text-lg font-bold mb-4">Win/Loss Streaks</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Best Win Streak" value={String(streaks.maxWin)} color={trades.length ? "#22c55e" : "#888"} />
            <StatCard label="Worst Loss Streak" value={String(streaks.maxLoss)} color={trades.length ? "#ef4444" : "#888"} />
            <StatCard
              label="Current Streak"
              value={streaks.currentType ? `${streaks.currentStreak} ${streaks.currentType === "win" ? "W" : "L"}` : "—"}
              color={streaks.currentType === "win" ? "#22c55e" : streaks.currentType === "loss" ? "#ef4444" : "#888"}
            />
            <StatCard label="Win Days / Total" value={`${stats.winningDays}/${stats.tradingDays}`} color="#e8651a" />
          </div>

          {trades.length > 0 && (
            <>
              <div className="border-t border-chamber-border my-4" />
              <p className="font-bold mb-3 text-sm">Daily P&L Streak</p>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Best Green Day Streak" value={String(streaks.maxDayWin)} color="#22c55e" />
                <StatCard label="Worst Red Day Streak" value={String(streaks.maxDayLoss)} color="#ef4444" />
                <StatCard
                  label="Current Day Streak"
                  value={streaks.dayType ? `${streaks.dayStreak} ${streaks.dayType === "win" ? "green" : "red"}` : "—"}
                  color={streaks.dayType === "win" ? "#22c55e" : streaks.dayType === "loss" ? "#ef4444" : "#888"}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MENTAL CORRELATION TAB */}
      {/* ============================================================ */}
      {activeTab === "mental" && (
        <div>
          <h2 className="text-lg font-bold mb-4">Mental State vs Performance</h2>
          {!journals.length ? (
            <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 text-center text-chamber-text-muted text-sm">
              No journal entries found for this period. Fill out Daily Journal entries to see mental state correlations.
            </div>
          ) : !trades.length ? (
            <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 text-center text-chamber-text-muted text-sm">
              No trades found for this period. Log trades to see how your mental state correlates with performance.
            </div>
          ) : !mentalData ? (
            <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 text-center text-chamber-text-muted text-sm">
              No overlap between journal entries and trading days found. Make sure to fill journal entries on days you trade.
            </div>
          ) : (
            <>
              <p className="text-xs text-chamber-text-muted mb-4">
                Analyzing {mentalData.count} trading days with journal entries
              </p>

              {mentalData.highReady.length > 0 && mentalData.lowReady.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                  <div className="bg-chamber-surface border rounded-lg p-4" style={{ borderColor: "rgba(34,197,94,0.2)" }}>
                    <p className="text-chamber-green font-bold mb-2">High Readiness Days (7+)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <StatCard label="Avg P&L" value={formatDollar(mentalData.highReady.reduce((s, c) => s + c.pnl, 0) / mentalData.highReady.length)} color="#22c55e" />
                      <StatCard label="Avg WR" value={`${(mentalData.highReady.reduce((s, c) => s + c.winRate, 0) / mentalData.highReady.length).toFixed(0)}%`} color="#22c55e" />
                      <StatCard label="Days" value={String(mentalData.highReady.length)} />
                    </div>
                  </div>
                  <div className="bg-chamber-surface border rounded-lg p-4" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
                    <p className="text-chamber-red font-bold mb-2">Low Readiness Days (4-)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <StatCard label="Avg P&L" value={formatDollar(mentalData.lowReady.reduce((s, c) => s + c.pnl, 0) / mentalData.lowReady.length)} color="#ef4444" />
                      <StatCard label="Avg WR" value={`${(mentalData.lowReady.reduce((s, c) => s + c.winRate, 0) / mentalData.lowReady.length).toFixed(0)}%`} color="#ef4444" />
                      <StatCard label="Days" value={String(mentalData.lowReady.length)} />
                    </div>
                  </div>
                </div>
              )}

              {mentalData.catBreakdown.length > 0 && (
                <>
                  <div className="border-t border-chamber-border my-4" />
                  <p className="font-bold mb-3 text-sm">Performance by Mental State Category</p>
                  <div className="space-y-2">
                    {mentalData.catBreakdown.map((c) => (
                      <div key={c.cat} className="text-sm">
                        <span className="font-bold">{c.cat}</span>: High ({c.highCount}d) avg {formatDollar(c.hPnl)} vs Low ({c.lowCount}d) avg {formatDollar(c.lPnl)} —{" "}
                        <span style={{ color: c.diff > 0 ? "#22c55e" : "#ef4444" }}>
                          difference: {formatDollar(c.diff)}/day
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-8 mb-4">
        <p className="text-[0.65rem] text-[#333] tracking-wider">PERFORMANCE ANALYTICS &middot; DATA FROM YOUR JOURNAL</p>
        <p className="text-[0.58rem] text-[#292929]">THIS IS NOT FINANCIAL ADVICE</p>
      </div>
    </div>
  );
}
