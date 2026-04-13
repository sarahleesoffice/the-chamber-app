"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Trade } from "@/lib/types";
import { formatDollar } from "@/lib/trade-math";
import StatCard from "@/components/StatCard";

export default function TradeHistoryPage() {
  const supabase = createClient();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [pairFilter, setPairFilter] = useState("");
  const [dirFilter, setDirFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const perPage = 20;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("trade_date", { ascending: false });
      setTrades((data as Trade[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  const pairs = useMemo(() => [...new Set(trades.map((t) => t.pair))].sort(), [trades]);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (pairFilter && t.pair !== pairFilter) return false;
      if (dirFilter && t.direction !== dirFilter) return false;
      if (resultFilter === "win" && t.pnl_pips <= 0) return false;
      if (resultFilter === "loss" && t.pnl_pips >= 0) return false;
      return true;
    });
  }, [trades, pairFilter, dirFilter, resultFilter]);

  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  // Stats for filtered trades
  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const winners = filtered.filter((t) => t.pnl_pips > 0);
    const losers = filtered.filter((t) => t.pnl_pips < 0);
    const totalPips = filtered.reduce((s, t) => s + t.pnl_pips, 0);
    const totalDollar = filtered.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
    const avgPips = totalPips / filtered.length;
    const winRate = (winners.length / filtered.length) * 100;
    return { total: filtered.length, winRate, totalPips, avgPips, totalDollar, winners: winners.length, losers: losers.length };
  }, [filtered]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    await supabase.from("trades").delete().eq("id", id);
    setTrades((prev) => prev.filter((t) => t.id !== id));
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><div className="text-chamber-text-muted">Loading...</div></div>;
  }

  return (
    <div className="space-y-6">
      <h1
        className="text-3xl font-bold tracking-[3px] text-chamber-orange"
        style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
      >
        TRADE HISTORY
      </h1>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Trades" value={String(stats.total)} />
          <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color={stats.winRate >= 55 ? "#22c55e" : stats.winRate >= 45 ? "#e8651a" : "#ef4444"} subText={`${stats.winners}W / ${stats.losers}L`} />
          <StatCard label="Total Pips" value={`${stats.totalPips > 0 ? "+" : ""}${stats.totalPips.toFixed(1)}`} color={stats.totalPips > 0 ? "#22c55e" : "#ef4444"} />
          <StatCard label="Avg Pips" value={stats.avgPips.toFixed(1)} color={stats.avgPips > 0 ? "#22c55e" : "#ef4444"} />
          <StatCard label="Net P&L" value={formatDollar(stats.totalDollar)} color={stats.totalDollar > 0 ? "#22c55e" : "#ef4444"} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={pairFilter}
          onChange={(e) => { setPairFilter(e.target.value); setPage(0); }}
          className="bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-sm text-white focus:border-chamber-orange focus:outline-none"
        >
          <option value="">All pairs</option>
          {pairs.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={dirFilter}
          onChange={(e) => { setDirFilter(e.target.value); setPage(0); }}
          className="bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-sm text-white focus:border-chamber-orange focus:outline-none"
        >
          <option value="">All directions</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select
          value={resultFilter}
          onChange={(e) => { setResultFilter(e.target.value); setPage(0); }}
          className="bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-sm text-white focus:border-chamber-orange focus:outline-none"
        >
          <option value="">All results</option>
          <option value="win">Winners</option>
          <option value="loss">Losers</option>
        </select>
      </div>

      {/* Trade list */}
      {paginated.length > 0 ? (
        <div className="space-y-2">
          {paginated.map((t) => {
            const pnlColor = t.pnl_pips > 0 ? "#22c55e" : t.pnl_pips < 0 ? "#ef4444" : "#888";
            const resultTag = t.pnl_pips > 0 ? "WIN" : t.pnl_pips < 0 ? "LOSS" : "BE";
            const resultBg = t.pnl_pips > 0 ? "bg-green-500/10" : t.pnl_pips < 0 ? "bg-red-500/10" : "bg-gray-500/10";
            const expanded = expandedId === t.id;

            return (
              <div key={t.id} className="bg-chamber-surface border border-chamber-border rounded-lg overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(expanded ? null : (t.id || null))}
                  className="w-full flex justify-between items-center p-4 text-left hover:bg-chamber-orange/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-chamber-text-muted text-[0.75rem]">{t.trade_date}</span>
                    <span className="text-white font-bold">{t.pair}</span>
                    <span className="text-chamber-text-muted text-sm uppercase">{t.direction}</span>
                    <span className={`${resultBg} text-[0.68rem] font-bold px-2.5 py-0.5 rounded-full`} style={{ color: pnlColor }}>
                      {resultTag}
                    </span>
                  </div>
                  <span className="font-bold text-lg" style={{ color: pnlColor }}>
                    {t.pnl_dollar ? formatDollar(t.pnl_dollar) : `${t.pnl_pips > 0 ? "+" : ""}${t.pnl_pips.toFixed(1)}p`}
                  </span>
                </button>

                {/* Expanded details */}
                {expanded && (
                  <div className="px-4 pb-4 border-t border-chamber-border">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3 text-sm">
                      <div>
                        <span className="text-chamber-text-dim text-[0.7rem]">Entry</span>
                        <div className="text-white">{t.entry_price}</div>
                      </div>
                      <div>
                        <span className="text-chamber-text-dim text-[0.7rem]">Exit</span>
                        <div className="text-white">{t.exit_price}</div>
                      </div>
                      <div>
                        <span className="text-chamber-text-dim text-[0.7rem]">Pips</span>
                        <div style={{ color: pnlColor }}>{t.pnl_pips > 0 ? "+" : ""}{t.pnl_pips.toFixed(1)}</div>
                      </div>
                      <div>
                        <span className="text-chamber-text-dim text-[0.7rem]">Dollar</span>
                        <div style={{ color: pnlColor }}>{t.pnl_dollar ? formatDollar(t.pnl_dollar) : "—"}</div>
                      </div>
                    </div>
                    {t.reasoning && (
                      <div className="border-t border-[#1a1a1a] pt-3 mt-1">
                        <p className="text-chamber-text-muted text-sm italic leading-relaxed">&ldquo;{t.reasoning}&rdquo;</p>
                      </div>
                    )}
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={() => handleDelete(t.id!)}
                        className="text-[0.75rem] text-chamber-text-dim hover:text-red-400 transition-colors"
                      >
                        Delete trade
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-10 text-center text-chamber-text-muted">
          {trades.length === 0 ? "No trades logged yet." : "No trades match the current filters."}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange disabled:opacity-30 transition-colors"
          >
            &lt; Prev
          </button>
          <span className="text-sm text-chamber-text-muted">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange disabled:opacity-30 transition-colors"
          >
            Next &gt;
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-[#333] text-[0.65rem] tracking-wider">BASED ON ICT CONCEPTS</p>
        <p className="text-[#292929] text-[0.58rem] mt-1">THIS IS NOT FINANCIAL ADVICE</p>
      </div>
    </div>
  );
}
