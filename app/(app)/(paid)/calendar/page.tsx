"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Trade, JournalEntry } from "@/lib/types";
import { formatDollar } from "@/lib/trade-math";
import StatCard from "@/components/StatCard";
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

export default function CalendarPage() {
  const supabase = createClient();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [calMonth, setCalMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [tradesRes, journalsRes] = await Promise.all([
        supabase.from("trades").select("*").eq("user_id", user.id).order("trade_date", { ascending: false }),
        supabase.from("journal_entries").select("journal_date, readiness_score, readiness_label").eq("user_id", user.id),
      ]);
      setTrades((tradesRes.data as Trade[]) || []);
      setJournals((journalsRes.data as JournalEntry[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  // Monthly stat cards
  const monthTrades = useMemo(() => {
    const start = format(startOfMonth(calMonth), "yyyy-MM-dd");
    const end = format(endOfMonth(calMonth), "yyyy-MM-dd");
    return trades.filter((t) => t.trade_date >= start && t.trade_date <= end);
  }, [trades, calMonth]);

  const dailyPnl = useMemo(() => {
    const map: Record<string, { pips: number; dollar: number; count: number; trades: Trade[] }> = {};
    for (const t of monthTrades) {
      if (!map[t.trade_date]) map[t.trade_date] = { pips: 0, dollar: 0, count: 0, trades: [] };
      map[t.trade_date].pips += t.pnl_pips;
      map[t.trade_date].dollar += t.pnl_dollar || 0;
      map[t.trade_date].count++;
      map[t.trade_date].trades.push(t);
    }
    return map;
  }, [monthTrades]);

  const journalMap = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const j of journals) map.set(j.journal_date, j);
    return map;
  }, [journals]);

  // Monthly stats
  const monthStats = useMemo(() => {
    const mDollar = monthTrades.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
    const mPips = monthTrades.reduce((s, t) => s + t.pnl_pips, 0);
    const tradingDays = new Set(monthTrades.map((t) => t.trade_date));
    const winDays = new Set<string>();
    const loseDays = new Set<string>();
    for (const d of tradingDays) {
      const dp = monthTrades.filter((t) => t.trade_date === d).reduce((s, t) => s + t.pnl_pips, 0);
      if (dp > 0) winDays.add(d); else if (dp < 0) loseDays.add(d);
    }
    const wins = monthTrades.filter((t) => t.pnl_pips > 0).length;
    const wr = monthTrades.length ? (wins / monthTrades.length) * 100 : 0;
    return { mDollar, mPips, tradingDays: tradingDays.size, winDays: winDays.size, loseDays: loseDays.size, wr };
  }, [monthTrades]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-chamber-text-muted">Loading calendar...</div>
      </div>
    );
  }

  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const pnlColor = monthStats.mPips > 0 ? "#22c55e" : monthStats.mPips < 0 ? "#ef4444" : "#a0a0a0";
  const wrColor = monthStats.wr >= 55 ? "#22c55e" : monthStats.wr >= 45 ? "#e8651a" : "#ef4444";

  // Selected day data
  const selectedDayData = selectedDay ? dailyPnl[selectedDay] : null;
  const selectedJournal = selectedDay ? journalMap.get(selectedDay) : null;

  return (
    <div className="space-y-6">
      <h1
        className="text-3xl font-bold tracking-[3px] text-chamber-orange"
        style={{ textShadow: "0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15)" }}
      >
        TRADING CALENDAR
      </h1>
      <p className="text-chamber-text-muted text-sm">Review your trading performance by date</p>

      {/* Monthly stat cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <StatCard
          label="Monthly P&L"
          value={monthStats.mDollar ? formatDollar(monthStats.mDollar) : monthStats.mPips ? `${monthStats.mPips > 0 ? "+" : ""}${monthStats.mPips.toFixed(1)} pips` : "—"}
          color={pnlColor}
        />
        <StatCard label="Total Trades" value={String(monthTrades.length)} />
        <StatCard label="Trading Days" value={String(monthStats.tradingDays)} color="#e8651a" />
        <StatCard label="Winning Days" value={String(monthStats.winDays)} color="#22c55e" />
        <StatCard label="Losing Days" value={String(monthStats.loseDays)} color="#ef4444" />
        <StatCard label="Win Rate" value={monthTrades.length ? `${monthStats.wr.toFixed(0)}%` : "—"} color={monthTrades.length ? wrColor : "#a0a0a0"} />
      </div>

      {/* Month nav */}
      <div className="flex items-center">
        <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors">
          &lt; Prev
        </button>
        <span className="flex-1 text-center text-lg font-semibold text-white">{format(calMonth, "MMMM yyyy")}</span>
        <div className="flex gap-2">
          <button onClick={() => setCalMonth(new Date())} className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors">
            Today
          </button>
          <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors">
            Next &gt;
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[0.7rem] text-chamber-text-muted uppercase tracking-wider py-1.5 font-semibold">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-[100px] lg:min-h-[120px]" />
        ))}
        {daysInMonth.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dp = dailyPnl[dateStr];
          const journal = journalMap.get(dateStr);
          const hasTradesDay = !!dp;
          const isCurrentDay = isToday(day);
          const isSelected = selectedDay === dateStr;

          let bgClass = "bg-[#0e0e0e] border-chamber-border";
          let textColor = "text-chamber-text-dim";
          if (hasTradesDay) {
            if (dp.pips > 0) { bgClass = "bg-green-500/10 border-green-500/25"; textColor = "text-green-400"; }
            else if (dp.pips < 0) { bgClass = "bg-red-500/10 border-red-500/25"; textColor = "text-red-400"; }
          }

          return (
            <div
              key={dateStr}
              onClick={() => (hasTradesDay || journal) && setSelectedDay(isSelected ? null : dateStr)}
              className={`min-h-[100px] lg:min-h-[120px] rounded-lg border p-1.5 flex flex-col items-center justify-center transition-all ${bgClass} ${
                isCurrentDay ? "!border-chamber-orange !border-2 shadow-[0_0_8px_rgba(232,101,26,0.4)]" : ""
              } ${isSelected ? "!border-chamber-orange ring-1 ring-chamber-orange" : ""} ${
                hasTradesDay || journal ? "cursor-pointer hover:bg-chamber-orange/10 hover:border-chamber-orange/40" : ""
              }`}
            >
              <span className={`text-[0.7rem] ${isCurrentDay ? "text-white" : "text-chamber-text-muted"}`}>
                {format(day, "d")}
              </span>
              {hasTradesDay && (
                <>
                  <span className={`text-sm font-bold ${textColor}`}>
                    {dp.dollar ? formatDollar(dp.dollar) : `${dp.pips > 0 ? "+" : ""}${dp.pips.toFixed(0)}p`}
                  </span>
                  <span className="text-[0.55rem] text-chamber-text-dim">
                    {dp.count === 1 ? "1 Trade" : `${dp.count} Trades`}
                  </span>
                </>
              )}
              {journal && (
                <span className="text-[0.55rem] mt-0.5" style={{ color: journal.readiness_score >= 7 ? "#22c55e" : journal.readiness_score >= 4 ? "#e8651a" : "#ef4444" }}>
                  {journal.readiness_score}/10
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-5 justify-center flex-wrap">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-500/30 border border-green-500" /><span className="text-[0.7rem] text-chamber-text-muted">Profit</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500/30 border border-red-500" /><span className="text-[0.7rem] text-chamber-text-muted">Loss</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-chamber-orange" /><span className="text-[0.7rem] text-chamber-text-muted">Mental Score</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded border-2 border-chamber-orange shadow-[0_0_6px_rgba(232,101,26,0.5)]" /><span className="text-[0.7rem] text-chamber-text-muted">Today</span></div>
      </div>

      {/* Selected Day Detail */}
      {selectedDay && (selectedDayData || selectedJournal) && (
        <div className="bg-chamber-surface border border-chamber-border rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-white">
              {format(new Date(selectedDay + "T00:00:00"), "EEEE, MMMM d, yyyy")}
            </h3>
            <button onClick={() => setSelectedDay(null)} className="text-chamber-text-muted hover:text-chamber-orange text-sm">
              Close
            </button>
          </div>

          {selectedJournal && (
            <div className="mb-4 p-3 rounded-lg border" style={{ borderColor: selectedJournal.readiness_score >= 7 ? "rgba(34,197,94,0.3)" : selectedJournal.readiness_score >= 4 ? "rgba(232,101,26,0.3)" : "rgba(239,68,68,0.3)" }}>
              <div className="flex items-center gap-3">
                <span className="text-sm text-chamber-text-muted">Readiness:</span>
                <span className="font-bold text-lg" style={{ color: selectedJournal.readiness_score >= 7 ? "#22c55e" : selectedJournal.readiness_score >= 4 ? "#e8651a" : "#ef4444" }}>
                  {selectedJournal.readiness_score}/10
                </span>
                {selectedJournal.readiness_label && (
                  <span className="text-xs text-chamber-text-muted">{selectedJournal.readiness_label}</span>
                )}
              </div>
            </div>
          )}

          {selectedDayData && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <StatCard label="Day P&L" value={formatDollar(selectedDayData.dollar)} color={selectedDayData.pips > 0 ? "#22c55e" : "#ef4444"} />
                <StatCard label="Trades" value={String(selectedDayData.count)} />
                <StatCard label="Pips" value={`${selectedDayData.pips > 0 ? "+" : ""}${selectedDayData.pips.toFixed(1)}`} color={selectedDayData.pips > 0 ? "#22c55e" : "#ef4444"} />
              </div>
              <div className="space-y-1">
                {selectedDayData.trades.map((t) => (
                  <div key={t.id} className="flex justify-between items-center py-2 px-3 border-b border-[#1a1a1a]">
                    <div>
                      <strong className="text-white">{t.pair}</strong>
                      <span className="text-chamber-text-muted text-sm ml-2 uppercase">{t.direction}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold" style={{ color: t.pnl_pips > 0 ? "#22c55e" : t.pnl_pips < 0 ? "#ef4444" : "#888" }}>
                        {t.pnl_dollar ? formatDollar(t.pnl_dollar) : `${t.pnl_pips > 0 ? "+" : ""}${t.pnl_pips.toFixed(1)}p`}
                      </span>
                      <span className="text-[0.75rem] ml-1" style={{ color: t.pnl_pips > 0 ? "#22c55e" : t.pnl_pips < 0 ? "#ef4444" : "#888" }}>
                        {t.pnl_pips > 0 ? "W" : t.pnl_pips < 0 ? "L" : "BE"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-[#333] text-[0.65rem] tracking-wider">TRADING CALENDAR · CLICK A DAY TO SEE DETAILS</p>
        <p className="text-[#292929] text-[0.58rem] mt-1">THIS IS NOT FINANCIAL ADVICE</p>
      </div>
    </div>
  );
}
