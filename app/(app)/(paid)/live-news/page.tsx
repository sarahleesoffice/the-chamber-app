"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";

/* ── Categories ─────────────────────────────────────────────── */
const CATEGORIES: Record<string, string> = {
  "Economic Data": "#ef4444",
  "Central Banks": "#e8651a",
  Geopolitical: "#a855f7",
  Commodities: "#eab308",
  Equities: "#22c55e",
  Forex: "#3b82f6",
  Crypto: "#06b6d4",
  "Market News": "#a0a0a0",
};

const HIGH_IMPACT = new Set(["Economic Data", "Central Banks"]);

const TIME_RANGES = ["All Time", "Last Hour", "Last 4 Hours", "Today"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

/* ── Types ──────────────────────────────────────────────────── */
interface NewsItem {
  id: string;
  title: string;
  category: string;
  timestamp: string; // ISO
}

/* ── Sample data (shown when API unavailable) ───────────────── */
function sampleNews(): NewsItem[] {
  const now = Date.now();
  return [
    { id: "s1", title: "US CPI comes in hotter than expected at 3.5% YoY — markets reprice Fed rate path", category: "Economic Data", timestamp: new Date(now - 4 * 60_000).toISOString() },
    { id: "s2", title: "Fed Governor Waller signals patience on rate cuts, cites sticky shelter inflation", category: "Central Banks", timestamp: new Date(now - 12 * 60_000).toISOString() },
    { id: "s3", title: "EUR/USD drops below 1.0700 as dollar strengthens on hot inflation print", category: "Forex", timestamp: new Date(now - 18 * 60_000).toISOString() },
    { id: "s4", title: "Gold rallies past $2,350 as geopolitical tensions escalate in Middle East", category: "Commodities", timestamp: new Date(now - 25 * 60_000).toISOString() },
    { id: "s5", title: "China retaliates with new tariffs on US agricultural imports effective next week", category: "Geopolitical", timestamp: new Date(now - 33 * 60_000).toISOString() },
    { id: "s6", title: "S&P 500 futures slide 0.8% pre-market following CPI surprise", category: "Equities", timestamp: new Date(now - 40 * 60_000).toISOString() },
    { id: "s7", title: "Bitcoin breaks above $72K as ETF inflows hit record $1.2B single-day", category: "Crypto", timestamp: new Date(now - 48 * 60_000).toISOString() },
    { id: "s8", title: "ECB's Lagarde reaffirms June rate cut path despite Fed divergence", category: "Central Banks", timestamp: new Date(now - 55 * 60_000).toISOString() },
    { id: "s9", title: "US Initial Jobless Claims fall to 210K vs 215K expected — labor market remains tight", category: "Economic Data", timestamp: new Date(now - 62 * 60_000).toISOString() },
    { id: "s10", title: "WTI crude oil surges 3.2% on OPEC+ production cut extension rumors", category: "Commodities", timestamp: new Date(now - 70 * 60_000).toISOString() },
    { id: "s11", title: "GBP/JPY hits 200 for first time since 2015 as BOJ intervention fears grow", category: "Forex", timestamp: new Date(now - 82 * 60_000).toISOString() },
    { id: "s12", title: "Nvidia earnings crush estimates — after-hours +8%, AI trade continues", category: "Equities", timestamp: new Date(now - 95 * 60_000).toISOString() },
    { id: "s13", title: "Taiwan Strait tensions rise as China announces military drills near island", category: "Geopolitical", timestamp: new Date(now - 110 * 60_000).toISOString() },
    { id: "s14", title: "Ethereum ETF approval odds jump to 75% according to Bloomberg analysts", category: "Crypto", timestamp: new Date(now - 120 * 60_000).toISOString() },
    { id: "s15", title: "US 10Y yield tops 4.65% — highest since November — mortgage rates follow", category: "Market News", timestamp: new Date(now - 135 * 60_000).toISOString() },
  ];
}

/* ── Helpers ─────────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function filterByTime(items: NewsItem[], range: TimeRange): NewsItem[] {
  if (range === "All Time") return items;
  const now = Date.now();
  const cutoffs: Record<string, number> = {
    "Last Hour": 60 * 60_000,
    "Last 4 Hours": 4 * 60 * 60_000,
    Today: 24 * 60 * 60_000,
  };
  const ms = cutoffs[range] ?? Infinity;
  return items.filter((n) => now - new Date(n.timestamp).getTime() <= ms);
}

/* ── Component ──────────────────────────────────────────────── */
export default function LiveNewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [timeRange, setTimeRange] = useState<TimeRange>("All Time");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news");
      if (!res.ok) throw new Error("api error");
      const data = await res.json();
      const items = (data.items || []).map((item: { title: string; category: string; pubDate: string; link: string; pubDateStr: string; timeAgo: string }, i: number) => ({
        id: `fj-${i}`,
        title: item.title,
        category: item.category,
        timestamp: item.pubDate,
        link: item.link,
        pubDateStr: item.pubDateStr,
        fjTimeAgo: item.timeAgo,
      }));
      if (items.length === 0) throw new Error("empty");
      setNews(items);
      setUsingSample(false);
    } catch {
      setNews(sampleNews());
      setUsingSample(true);
    }
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 2 * 60_000);
    return () => clearInterval(interval);
  }, [fetchNews]);

  /* derived */
  const timeFiltered = filterByTime(news || [], timeRange) || [];
  const filtered =
    categoryFilter === "All"
      ? timeFiltered
      : timeFiltered.filter((n) => n.category === categoryFilter);

  const counts: Record<string, number> = {};
  for (const n of timeFiltered) counts[n.category] = (counts[n.category] || 0) + 1;

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div>
      <div>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "#f5f5f5" }}>
            Live News
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#888" }}>
            Real-time market news from Financial Juice · Auto-categorized for traders
          </p>
        </div>

        {/* Controls Row */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {/* Category dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
            style={{
              background: "#141414",
              borderColor: "#1e1a17",
              color: "#f5f5f5",
            }}
          >
            <option value="All">All Categories</option>
            {Object.keys(CATEGORIES).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Time range dropdown */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1"
            style={{
              background: "#141414",
              borderColor: "#1e1a17",
              color: "#f5f5f5",
            }}
          >
            {TIME_RANGES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {/* Refresh */}
          <button
            onClick={fetchNews}
            disabled={loading}
            className="ml-auto flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[#e8651a]/60"
            style={{
              background: "#141414",
              borderColor: "#1e1a17",
              color: loading ? "#555" : "#e8651a",
            }}
          >
            <svg
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {/* Category Pills */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter("All")}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={{
              background: categoryFilter === "All" ? "#1e1a17" : "transparent",
              borderColor: categoryFilter === "All" ? "#e8651a" : "#1e1a17",
              color: categoryFilter === "All" ? "#f5f5f5" : "#888",
            }}
          >
            All ({timeFiltered.length})
          </button>
          {Object.entries(CATEGORIES).map(([cat, color]) => {
            const count = counts[cat] || 0;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(active ? "All" : cat)}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: active ? `${color}15` : "transparent",
                  borderColor: active ? color : "#1e1a17",
                  color: active ? color : "#888",
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: color }}
                />
                {cat}
                {count > 0 && (
                  <span
                    className="ml-0.5 rounded-full px-1.5 text-[10px] font-bold"
                    style={{ background: `${color}25`, color }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Connection status */}
        {usingSample && (
          <div
            className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs"
            style={{ background: "#141414", borderColor: "#1e1a17", color: "#888" }}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
            Connecting to news feed... Showing sample headlines
          </div>
        )}

        {/* News Feed */}
        {loading && news.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "#e8651a", borderTopColor: "transparent" }}
              />
              <span className="text-sm" style={{ color: "#888" }}>
                Connecting to news feed...
              </span>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm" style={{ color: "#555" }}>
            No headlines match your filters.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item) => {
              const color = CATEGORIES[item.category] || "#a0a0a0";
              const highImpact = HIGH_IMPACT.has(item.category);
              return (
                <div
                  key={item.id}
                  className="rounded-lg border px-4 py-3 transition-colors"
                  style={{
                    background: "#141414",
                    borderColor: "#1e1a17",
                    borderLeftWidth: highImpact ? 2 : 2,
                    borderLeftColor: color,
                    boxShadow: highImpact ? `0 0 12px ${color}20` : undefined,
                  }}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    {/* Category tag */}
                    <span
                      className="mt-0.5 shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: `${color}18`, color }}
                    >
                      {item.category}
                    </span>

                    {/* Content */}
                    <div className="flex-1">
                      <p className="text-sm leading-relaxed" style={{ color: "#f5f5f5" }}>
                        {item.title}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "#555" }}>
                        {formatTimestamp(item.timestamp)} · {timeAgo(item.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Last refresh */}
        {!loading && (
          <div className="mt-4 text-right text-xs" style={{ color: "#555" }}>
            Last updated: {lastRefresh.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 space-y-1 text-center">
          <p className="text-[10px] font-medium tracking-[0.2em] uppercase" style={{ color: "#555" }}>
            Powered by Financial Juice · Refreshes every 2 minutes
          </p>
          <p className="text-[10px] tracking-[0.15em] uppercase" style={{ color: "#333" }}>
            Economic Data &amp; Central Bank headlines are highlighted
          </p>
        </div>
      </div>
    </div>
  );
}
