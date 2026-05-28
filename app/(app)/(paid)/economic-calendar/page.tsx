"use client";

import { useState, useMemo, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────
interface CalendarEvent {
  date: string; // YYYY-MM-DD
  time: string; // e.g. "8:30 AM"
  country: string;
  title: string;
  impact: "High" | "Medium" | "Low";
  forecast?: string;
  previous?: string;
}

type ImpactFilter = "All" | "High Only" | "High + Medium";

// ── SVG folder icons ─────────────────────────────────────────
function FolderIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={14} height={14} className="shrink-0">
      <path
        d="M10 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
        fill={color}
      />
    </svg>
  );
}

// ── Static high-impact reference data ────────────────────────
const HIGH_IMPACT_REFERENCE = [
  { event: "FOMC / Fed Rate Decision", schedule: "8x/year (Wed 2PM EST)", impact: "Extreme" },
  { event: "Non-Farm Payrolls (NFP)", schedule: "First Friday of month (8:30AM EST)", impact: "Extreme" },
  { event: "CPI / Inflation Data", schedule: "Monthly (8:30AM EST)", impact: "Very High" },
  { event: "ISM Manufacturing/Services", schedule: "Monthly", impact: "Moderate-High" },
  { event: "Jobless Claims", schedule: "Every Thursday (8:30AM EST)", impact: "Moderate" },
  { event: "GDP", schedule: "Quarterly", impact: "Moderate-High" },
  { event: "PPI (Producer Price Index)", schedule: "Monthly", impact: "Moderate-High" },
  { event: "Retail Sales", schedule: "Monthly (8:30AM EST)", impact: "High" },
  { event: "PCE Price Index", schedule: "Monthly (8:30AM EST)", impact: "Very High" },
  { event: "ECB Rate Decision", schedule: "6x/year", impact: "High" },
];

// ── Week helpers ─────────────────────────────────────────────
function getWeekDays(): Date[] {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day === 0 ? 7 : day) - 1));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// ── Static sample events for the current week ────────────────
// These serve as placeholder data when no live feed is connected.
function generateSampleEvents(): CalendarEvent[] {
  const week = getWeekDays();
  const samples: CalendarEvent[] = [];

  // Monday
  samples.push(
    { date: formatDateKey(week[0]), time: "10:00 AM", country: "USD", title: "ISM Manufacturing PMI", impact: "High", forecast: "49.5", previous: "49.2" },
    { date: formatDateKey(week[0]), time: "8:30 AM", country: "EUR", title: "German Manufacturing PMI", impact: "Medium", forecast: "43.1", previous: "42.5" },
  );
  // Tuesday
  samples.push(
    { date: formatDateKey(week[1]), time: "10:00 AM", country: "USD", title: "JOLTS Job Openings", impact: "High", forecast: "8.75M", previous: "8.76M" },
    { date: formatDateKey(week[1]), time: "3:30 AM", country: "GBP", title: "Services PMI", impact: "Medium", forecast: "53.2", previous: "53.8" },
  );
  // Wednesday
  samples.push(
    { date: formatDateKey(week[2]), time: "8:15 AM", country: "USD", title: "ADP Non-Farm Employment", impact: "High", forecast: "150K", previous: "143K" },
    { date: formatDateKey(week[2]), time: "10:00 AM", country: "USD", title: "ISM Services PMI", impact: "High", forecast: "52.5", previous: "52.6" },
    { date: formatDateKey(week[2]), time: "10:30 AM", country: "USD", title: "Crude Oil Inventories", impact: "Medium", forecast: "-1.2M", previous: "-2.0M" },
  );
  // Thursday
  samples.push(
    { date: formatDateKey(week[3]), time: "8:30 AM", country: "USD", title: "Unemployment Claims", impact: "High", forecast: "215K", previous: "211K" },
    { date: formatDateKey(week[3]), time: "7:00 AM", country: "EUR", title: "ECB Rate Decision", impact: "High", forecast: "4.50%", previous: "4.50%" },
    { date: formatDateKey(week[3]), time: "8:30 AM", country: "CAD", title: "Employment Change", impact: "Medium", forecast: "25.0K", previous: "37.3K" },
  );
  // Friday
  samples.push(
    { date: formatDateKey(week[4]), time: "8:30 AM", country: "USD", title: "Non-Farm Payrolls", impact: "High", forecast: "200K", previous: "256K" },
    { date: formatDateKey(week[4]), time: "8:30 AM", country: "USD", title: "Unemployment Rate", impact: "High", forecast: "4.1%", previous: "4.1%" },
    { date: formatDateKey(week[4]), time: "10:00 AM", country: "USD", title: "Univ of Michigan Sentiment", impact: "Medium", forecast: "64.7", previous: "64.7" },
  );

  return samples;
}

// ── Page component ───────────────────────────────────────────
export default function EconomicCalendarPage() {
  const [filter, setFilter] = useState<ImpactFilter>("High + Medium");
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [liveEvents, setLiveEvents] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const weekDays = useMemo(() => getWeekDays(), []);
  const sampleEvents = useMemo(() => generateSampleEvents(), []);

  // Fetch live data from Forex Factory
  useEffect(() => {
    async function fetchCalendar() {
      try {
        const res = await fetch("/api/forex-calendar");
        if (res.ok) {
          const data = await res.json();
          if (data.events && data.events.length > 0) {
            // Convert FF date format (MM-DD-YYYY) to our format
            const converted: CalendarEvent[] = data.events.map((e: { date: string; time: string; country: string; title: string; impact: string; forecast: string; previous: string }) => ({
              ...e,
              date: e.date, // Keep as MM-DD-YYYY, we'll match below
            }));
            setLiveEvents(converted);
          }
        }
      } catch { /* fall back to sample */ }
      setLoading(false);
    }
    fetchCalendar();
  }, []);

  // Use live events if available, otherwise sample
  const events = useMemo(() => {
    if (!liveEvents) return sampleEvents;
    // Convert FF dates (MM-DD-YYYY) to YYYY-MM-DD for consistency
    const weekDateKeys = new Set(weekDays.map((d) => d.toISOString().split("T")[0]));
    return liveEvents
      .map((e) => {
        // Convert MM-DD-YYYY to YYYY-MM-DD
        const parts = e.date.split("-");
        const isoDate = parts.length === 3 ? `${parts[2]}-${parts[0]}-${parts[1]}` : e.date;
        return { ...e, date: isoDate };
      })
      .filter((e) => weekDateKeys.has(e.date));
  }, [liveEvents, sampleEvents, weekDays]);

  const weekLabel = useMemo(() => {
    const mon = weekDays[0];
    const fri = weekDays[4];
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
    return `${fmt(mon)} \u2013 ${fmt(fri)}, ${fri.getFullYear()}`;
  }, [weekDays]);

  // Filter events
  const filtered = useMemo(() => {
    if (filter === "All") return events;
    if (filter === "High Only") return events.filter((e) => e.impact === "High");
    return events.filter((e) => e.impact === "High" || e.impact === "Medium");
  }, [events, filter]);

  // Group by date
  const byDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of filtered) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [filtered]);

  function toggleDay(key: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filters: ImpactFilter[] = ["All", "High Only", "High + Medium"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold tracking-[3px] text-chamber-orange"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          ECONOMIC CALENDAR
        </h1>
        <p className="text-chamber-text-muted text-sm mt-1">
          Live data from Forex Factory &middot; All times in EST
        </p>
      </div>

      {/* Data source status */}
      {loading ? (
        <div className="text-chamber-text-dim text-xs">Loading calendar data from Forex Factory...</div>
      ) : liveEvents ? (
        <div className="text-[0.65rem] text-chamber-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-chamber-green mr-1" />
          Live data from Forex Factory · {events.length} events this week · All times EST
        </div>
      ) : (
        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-3 text-center">
          <p className="text-chamber-text-dim text-xs">Showing sample data — Forex Factory feed unavailable</p>
        </div>
      )}

      {/* Impact filter buttons */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: filter === f ? "#e8651a" : "#141414",
              color: filter === f ? "#0a0a0a" : "#888",
              border: filter === f ? "1px solid #e8651a" : "1px solid #1e1a17",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Week label */}
      <div className="text-center">
        <span className="text-chamber-text text-lg font-semibold">{weekLabel}</span>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-5 gap-1">
        {weekDays.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={i}
              className="text-center py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{ color: isToday ? "#e8651a" : "#a0a0a0", fontWeight: isToday ? 700 : 600 }}
            >
              {DAY_NAMES[i]} {d.getDate()}
            </div>
          );
        })}
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-5 gap-1">
        {weekDays.map((d, i) => {
          const key = formatDateKey(d);
          const isToday = isSameDay(d, today);
          const dayEvents = byDate[key] || [];
          const highEvents = dayEvents.filter((e) => e.impact === "High");
          const medEvents = dayEvents.filter((e) => e.impact === "Medium");

          return (
            <div
              key={i}
              className="rounded-lg p-2 overflow-y-auto"
              style={{
                background: isToday ? "#1a1210" : "#0e0e0e",
                border: isToday ? "2px solid #e8651a" : "1px solid #1e1a17",
                minHeight: 180,
              }}
            >
              {/* TODAY badge */}
              {isToday && (
                <div className="mb-1.5">
                  <span
                    className="inline-block text-[0.55rem] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "#e8651a", color: "#0a0a0a" }}
                  >
                    TODAY
                  </span>
                </div>
              )}

              {/* Count summary */}
              {(highEvents.length > 0 || medEvents.length > 0) && (
                <div className="mb-1 flex gap-2 text-[0.6rem]">
                  {highEvents.length > 0 && <span className="text-chamber-red">{highEvents.length} red</span>}
                  {medEvents.length > 0 && <span className="text-chamber-orange">{medEvents.length} orange</span>}
                </div>
              )}

              {/* Event rows */}
              {dayEvents.length === 0 && (
                <div className="text-chamber-text-dim text-[0.7rem] text-center pt-12">No events</div>
              )}
              {dayEvents.map((e, j) => {
                const isHigh = e.impact === "High";
                const color = isHigh ? "#ef4444" : "#e8651a";
                const bgTint = isHigh ? "rgba(239,68,68,0.1)" : "rgba(232,101,26,0.08)";
                return (
                  <div
                    key={j}
                    className="flex items-center gap-1 my-0.5 px-1 py-0.5 rounded"
                    style={{ background: bgTint }}
                  >
                    <FolderIcon color={color} />
                    <span className="text-[0.65rem] font-bold shrink-0" style={{ color }}>
                      {e.country}
                    </span>
                    <span className="text-[0.6rem] text-gray-300 truncate flex-1">{e.title.slice(0, 25)}</span>
                    {e.time && <span className="text-[0.55rem] text-gray-500 shrink-0">{e.time} EST</span>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-6 justify-center py-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <FolderIcon color="#ef4444" />
          <span className="text-chamber-text-muted text-xs">High Impact</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FolderIcon color="#e8651a" />
          <span className="text-chamber-text-muted text-xs">Medium Impact</span>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-chamber-border" />

      {/* Full Event Details */}
      <div>
        <h2 className="text-chamber-text font-bold text-base mb-3">Full Event Details</h2>
        <div className="space-y-2">
          {weekDays.map((d, i) => {
            const key = formatDateKey(d);
            const dayEvents = byDate[key] || [];
            const relevant = dayEvents.filter((e) => e.impact === "High" || e.impact === "Medium");
            if (relevant.length === 0) return null;

            const isToday = isSameDay(d, today);
            const expanded = expandedDays.has(key) || isToday;
            const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
            const highCount = relevant.filter((e) => e.impact === "High").length;
            const medCount = relevant.filter((e) => e.impact === "Medium").length;

            let badge = "";
            if (highCount) badge += `${highCount} High`;
            if (medCount) badge += (badge ? ", " : "") + `${medCount} Medium`;

            return (
              <div key={i} className="bg-chamber-surface border border-chamber-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleDay(key)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-chamber-text font-semibold text-sm">
                      {label}
                      {isToday && <span className="text-chamber-orange ml-1">(TODAY)</span>}
                    </span>
                    <span className="text-chamber-text-dim text-xs">&mdash; {badge}</span>
                  </div>
                  <span className="text-chamber-text-dim text-xs">{expanded ? "\u25B2" : "\u25BC"}</span>
                </button>

                {expanded && (
                  <div className="px-4 pb-3 space-y-1.5">
                    {relevant.map((e, j) => {
                      const isHigh = e.impact === "High";
                      const color = isHigh ? "#ef4444" : "#e8651a";
                      return (
                        <div key={j} className="flex items-center gap-2 py-1 px-3 text-sm">
                          <FolderIcon color={color} />
                          <span className="font-semibold" style={{ color }}>
                            {e.country}
                          </span>
                          <span className="text-chamber-text">{e.title}</span>
                          <span className="text-chamber-text-muted text-xs ml-auto shrink-0">
                            {e.time ? `${e.time} EST` : "All Day"}
                            {e.forecast && ` | Forecast: ${e.forecast}`}
                            {e.previous && ` | Previous: ${e.previous}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-chamber-border" />

      {/* High-Impact Events Reference Table */}
      <div>
        <button
          onClick={() => toggleDay("__reference__")}
          className="w-full flex items-center justify-between bg-chamber-surface border border-chamber-border rounded-lg px-4 py-3 text-left hover:bg-[#1a1a1a] transition-colors"
        >
          <span className="text-chamber-text font-semibold text-sm">High-Impact Events Reference</span>
          <span className="text-chamber-text-dim text-xs">
            {expandedDays.has("__reference__") ? "\u25B2" : "\u25BC"}
          </span>
        </button>

        {expandedDays.has("__reference__") && (
          <div className="bg-chamber-surface border border-chamber-border border-t-0 rounded-b-lg overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <p className="text-chamber-text-muted text-sm mb-3">
                Key recurring events that cause the most volatility:
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-chamber-border">
                  <th className="text-left px-4 py-2 text-chamber-text-muted font-medium text-xs">Event</th>
                  <th className="text-left px-4 py-2 text-chamber-text-muted font-medium text-xs">Schedule</th>
                  <th className="text-left px-4 py-2 text-chamber-text-muted font-medium text-xs">Impact</th>
                </tr>
              </thead>
              <tbody>
                {HIGH_IMPACT_REFERENCE.map((row, i) => (
                  <tr key={i} className="border-b border-chamber-border/50 hover:bg-[#1a1a1a]">
                    <td className="px-4 py-2 text-chamber-text font-medium text-xs">{row.event}</td>
                    <td className="px-4 py-2 text-chamber-text-dim text-xs">{row.schedule}</td>
                    <td className="px-4 py-2">
                      <span
                        className="text-xs font-semibold"
                        style={{
                          color:
                            row.impact === "Extreme"
                              ? "#ef4444"
                              : row.impact === "Very High"
                              ? "#f97316"
                              : "#e8651a",
                        }}
                      >
                        {row.impact}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3">
              <p className="text-chamber-orange text-xs font-medium">
                The SMC rule: Don&apos;t trade 30 minutes before or after high-impact news. Let the manipulation
                play out, then look for displacement and entries in the aftermath.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center space-y-1 pt-4 pb-8">
        <p className="text-chamber-text-dim text-[0.65rem] tracking-[2px] uppercase">
          Economic Calendar &middot; Data Refreshes Periodically
        </p>
        <p className="text-chamber-text-dim text-[0.6rem] tracking-wider uppercase">
          This is not financial advice
        </p>
      </div>
    </div>
  );
}
