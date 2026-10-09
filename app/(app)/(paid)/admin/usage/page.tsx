"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StatCard from "@/components/StatCard";
import type { GroupStats, UsageReport } from "@/lib/usage-stats";

type Report = UsageReport & { byUser: (GroupStats & { label?: string })[]; truncated?: boolean };

const RANGES = [
  ["1d", "24 hours"],
  ["7d", "7 days"],
  ["30d", "30 days"],
] as const;

// Validated dark-surface categorical palette (fixed order; CVD + contrast checked).
const SLOTS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
const OTHER = "#6b6b66";
// Known agents keep the same color across ranges — color follows the entity, never its rank.
const KNOWN = ["chamber_ash", "ember", "ash", "amber", "ashley", "economic_calendar_bot", "event_watcher"];

/** Stable color per series key; stack order follows slot order so neighbors are validated pairs. */
function assignColors(keys: string[]) {
  const colors: Record<string, string> = {};
  const used = new Set<number>();
  for (const k of keys) {
    const i = KNOWN.indexOf(k);
    if (i >= 0) { colors[k] = SLOTS[i]; used.add(i); }
  }
  const free = SLOTS.map((_, i) => i).filter((i) => !used.has(i));
  for (const k of [...keys].sort()) {
    if (k === "Other" || colors[k]) continue;
    const i = free.shift();
    colors[k] = i === undefined ? OTHER : SLOTS[i];
    if (i !== undefined) used.add(i);
  }
  if (keys.includes("Other")) colors.Other = OTHER;
  const order = [...keys].sort((a, b) => {
    const ia = a === "Other" ? 99 : SLOTS.indexOf(colors[a]);
    const ib = b === "Other" ? 99 : SLOTS.indexOf(colors[b]);
    return ia - ib;
  });
  return { colors, order };
}

const money = (v: number) => (v > 0 && v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`);
const tokens = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v));
const ms = (v: number | null) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`);
const shortDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function GroupTable({ rows, label }: { rows: (GroupStats & { label?: string })[]; label: string }) {
  if (!rows.length) return <p className="text-xs text-chamber-text-dim">Nothing in this range.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-chamber-border">
      <table className="w-full min-w-[520px] text-xs border-collapse">
        <thead>
          <tr className="text-chamber-text-muted uppercase tracking-widest text-[0.6rem]">
            {[label, "Calls", "Errors", "Tokens in / out", "Avg latency", "Cost"].map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-chamber-border">
              <td className="px-3 py-1.5 text-chamber-text truncate max-w-[220px]" title={r.key}>{r.label || r.key}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.calls.toLocaleString()}</td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${r.errors ? "text-red-400" : "text-chamber-text-dim"}`}>{r.errors}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-chamber-text-muted">{tokens(r.inputTokens)} / {tokens(r.outputTokens)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-chamber-text-muted">{ms(r.avgLatencyMs)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-chamber-text">{money(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DayTooltip({ active, payload, label, colors }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; colors: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="rounded-lg border border-chamber-border bg-[#141414] px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-chamber-text mb-1">{label ? shortDay(label) : ""} · {money(total)}</div>
      {items.length ? items.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-chamber-text-muted">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: colors[p.dataKey] }} />
          <span className="flex-1">{p.dataKey}</span>
          <span className="tabular-nums text-chamber-text">{money(p.value)}</span>
        </div>
      )) : <div className="text-chamber-text-dim">No spend</div>}
    </div>
  );
}

export default function UsagePage() {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("7d");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loadedRange, setLoadedRange] = useState<string | null>(null);
  const loading = loadedRange !== range;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/usage?range=${range}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setError(r.status === 404 ? "This page is only available to admins." : d.error || "Couldn't load usage.");
          setReport(null);
        } else {
          setError("");
          setReport(d);
        }
      })
      .finally(() => !cancelled && setLoadedRange(range));
    return () => { cancelled = true; };
  }, [range]);

  const { colors, order } = useMemo(() => assignColors(report?.seriesKeys || []), [report]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[2px]" style={{ color: "#e8651a", textShadow: "0 0 20px rgba(232,101,26,0.4)" }}>AI USAGE</h1>
        <p className="text-chamber-text-dim text-xs mt-1">Every Claude call from the Mac mini fleet: agents, scheduled bots, and Chamber Ash. Synced every minute.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setRange(key)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
            style={{ background: range === key ? "#e8651a" : "#141414", color: range === key ? "#fff" : "#888", border: `1px solid ${range === key ? "#e8651a" : "#1e1a17"}` }}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && !report && !error && <p className="text-sm text-chamber-text-muted">Loading usage…</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <StatCard label="Cost" value={money(report.totals.cost)} color="#f5f5f5" subText={`last ${RANGES.find((r) => r[0] === range)?.[1]}`} />
            <StatCard label="Calls" value={report.totals.calls.toLocaleString()} />
            <StatCard label="Error rate" value={`${report.totals.errorRate.toFixed(1)}%`} color={report.totals.errorRate > 5 ? "#ef4444" : "#f5f5f5"} subText={`${report.totals.errors} failed`} />
            <StatCard label="Cache hit" value={report.totals.cacheHitRate == null ? "—" : `${report.totals.cacheHitRate.toFixed(0)}%`} subText="of input tokens" />
            <StatCard label="Latency" value={ms(report.totals.p50LatencyMs)} subText={`p95 ${ms(report.totals.p95LatencyMs)}`} />
          </div>

          <section className="space-y-2">
            <p className="text-sm font-bold text-chamber-text">Daily cost by agent</p>
            {report.totals.calls === 0 ? (
              <p className="text-xs text-chamber-text-dim">No calls logged in this range yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {order.map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-xs text-chamber-text-muted">
                      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[k] }} />
                      {k}
                    </span>
                  ))}
                </div>
                <div className="h-64 rounded-lg border border-chamber-border bg-[#111111] p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#232323" />
                      <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fill: "#888", fontSize: 11 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false} />
                      <YAxis tickFormatter={(v: number) => money(v)} tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
                      <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<DayTooltip colors={colors} />} />
                      {order.map((k, i) => (
                        <Bar
                          key={k}
                          dataKey={k}
                          stackId="cost"
                          fill={colors[k]}
                          stroke="#111111"
                          strokeWidth={2}
                          maxBarSize={36}
                          radius={i === order.length - 1 ? [4, 4, 0, 0] : 0}
                          isAnimationActive={false}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-bold text-chamber-text">By agent / bot</p>
            <GroupTable rows={report.byAgent} label="Agent" />
          </section>

          <div className="space-y-5">
            <section className="space-y-2">
              <p className="text-sm font-bold text-chamber-text">By model</p>
              <GroupTable rows={report.byModel} label="Model" />
            </section>
            <section className="space-y-2">
              <p className="text-sm font-bold text-chamber-text">Top users</p>
              <GroupTable rows={report.byUser} label="User" />
            </section>
          </div>

          <section className="space-y-2">
            <p className="text-sm font-bold text-chamber-text">Recent errors</p>
            {report.recentErrors.length ? (
              <div className="rounded-lg border border-chamber-border divide-y divide-chamber-border">
                {report.recentErrors.map((e, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <div className="flex flex-wrap gap-x-3 text-chamber-text-muted">
                      <span className="tabular-nums">{new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                      <span className="text-chamber-text">{e.agent}</span>
                      <span>{e.model}</span>
                    </div>
                    <div className="text-red-400/90 mt-0.5 break-words">{e.error}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-chamber-text-dim">No errors in this range.</p>
            )}
          </section>

          {report.truncated && <p className="text-xs text-chamber-text-dim">Showing the first 50,000 calls in this range.</p>}
        </>
      )}
    </div>
  );
}
