"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import StatCard from "@/components/StatCard";
import { DIFFICULTIES, DIFFICULTY_LABELS, type QuestionReport } from "@/lib/question-stats";

type Report = QuestionReport & { truncated?: boolean };

const RANGES = [
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["all", "All time"],
] as const;

const ACCENT = "#e8651a";
const pct = (v: number) => `${v.toFixed(0)}%`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function TopicTooltip({ active, payload }: { active?: boolean; payload?: { payload: Report["byTopic"][number] }[] }) {
  if (!active || !payload?.length) return null;
  const t = payload[0].payload;
  return (
    <div className="rounded-lg border border-chamber-border bg-[#141414] px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-chamber-text">{t.label}</div>
      <div className="text-chamber-text-muted tabular-nums">{t.count} messages · {pct(t.share)}</div>
    </div>
  );
}

export default function QuestionsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("30d");
  const [owner, setOwner] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = `${range}:${owner}`;
  const loading = loadedKey !== key;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/questions?range=${range}${owner ? "&owner=1" : ""}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setError(r.status === 404 ? "This page is only available to admins." : d.error || "Couldn't load questions.");
          setReport(null);
        } else {
          setError("");
          setReport(d);
        }
      })
      .finally(() => !cancelled && setLoadedKey(`${range}:${owner}`));
    return () => { cancelled = true; };
  }, [range, owner]);

  const topTopic = report?.byTopic[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[2px]" style={{ color: ACCENT, textShadow: "0 0 20px rgba(232,101,26,0.4)" }}>WHAT PEOPLE ASK</h1>
        <p className="text-chamber-text-dim text-xs mt-1">
          Every member message to Ember, Amber and Ash, tagged nightly on the Mac mini by topic, difficulty and the agent best suited to answer.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer"
            style={{ background: range === k ? ACCENT : "#141414", color: range === k ? "#fff" : "#888", border: `1px solid ${range === k ? ACCENT : "#1e1a17"}` }}
          >
            {label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-chamber-text-muted cursor-pointer select-none">
          <input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} className="accent-[#e8651a]" />
          Include my own messages
        </label>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && !report && !error && <p className="text-sm text-chamber-text-muted">Loading questions…</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Messages" value={report.totals.messages.toLocaleString()} subText={`${report.totals.members} people`} />
            <StatCard label="Simple" value={pct(report.totals.simpleShare)} subText="a small model would do" />
            <StatCard label="Needs live data" value={pct(report.totals.liveShare)} subText="market / news" />
            <StatCard label="Wrong agent" value={pct(report.totals.misroutedShare)} subText="asked the other mentor" />
          </div>

          {report.totals.messages === 0 ? (
            <p className="text-xs text-chamber-text-dim">Nothing tagged in this range yet. The tagger runs every night at 4:40 AM ET.</p>
          ) : (
            <>
              <section className="space-y-2">
                <p className="text-sm font-bold text-chamber-text">
                  Topics{topTopic ? <span className="font-normal text-chamber-text-muted"> · most asked: {topTopic.label}</span> : null}
                </p>
                <div className="rounded-lg border border-chamber-border bg-[#111111] p-2" style={{ height: 40 + report.byTopic.length * 30 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.byTopic} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="#232323" />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="label" width={130} tick={{ fill: "#bbb", fontSize: 11 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false} />
                      <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<TopicTooltip />} />
                      <Bar dataKey="count" fill={ACCENT} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-sm font-bold text-chamber-text">Difficulty by agent</p>
                <p className="text-xs text-chamber-text-dim">
                  &ldquo;Simple&rdquo; messages are the ones a cheaper model could answer. This is what the routing rules are based on.
                </p>
                <div className="overflow-x-auto rounded-lg border border-chamber-border">
                  <table className="w-full min-w-[520px] text-xs border-collapse">
                    <thead>
                      <tr className="text-chamber-text-muted uppercase tracking-widest text-[0.6rem]">
                        {["Agent", "Messages", ...DIFFICULTIES.map((d) => DIFFICULTY_LABELS[d]), "Wrong agent"].map((h, i) => (
                          <th key={h} className={`px-3 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.byBot.map((b) => (
                        <tr key={b.bot} className="border-t border-chamber-border">
                          <td className="px-3 py-1.5 text-chamber-text">{b.label}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-chamber-text">{b.total}</td>
                          {DIFFICULTIES.map((d) => (
                            <td key={d} className="px-3 py-1.5 text-right tabular-nums text-chamber-text-muted">
                              {b.difficulty[d] || 0}
                              <span className="text-chamber-text-dim"> · {pct(((b.difficulty[d] || 0) / b.total) * 100)}</span>
                            </td>
                          ))}
                          <td className="px-3 py-1.5 text-right tabular-nums text-chamber-text-muted">{b.misrouted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {report.misroutes.length > 0 && (
                  <p className="text-xs text-chamber-text-muted">
                    Asked the wrong mentor:{" "}
                    {report.misroutes.slice(0, 4).map((m, i) => (
                      <span key={`${m.from}-${m.to}`}>
                        {i ? " · " : ""}
                        {m.count}× {m.from} got a question for {m.to}
                      </span>
                    ))}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <p className="text-sm font-bold text-chamber-text">Recent questions</p>
                <div className="rounded-lg border border-chamber-border divide-y divide-chamber-border">
                  {report.recent.map((q, i) => (
                    <div key={i} className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-x-3 text-chamber-text-muted">
                        <span className="tabular-nums">{when(q.at)}</span>
                        <span className="text-chamber-text">{q.bot}</span>
                        <span>{q.topic}</span>
                        <span>{q.difficulty}</span>
                        <span className="text-chamber-text-dim">{q.channel}</span>
                      </div>
                      <div className="text-chamber-text mt-0.5 break-words">{q.summary}</div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {report.truncated && <p className="text-xs text-chamber-text-dim">Showing the first 20,000 messages in this range.</p>}
        </>
      )}
    </div>
  );
}
