/**
 * Aggregates public.llm_calls rows (written by the Mac mini fleet's per-call
 * logger) into what the admin usage dashboard shows. Pure — no I/O.
 */

export interface LlmCallRow {
  created_at: string;
  app: string | null;
  agent: string | null;
  user_id: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | string | null;
  latency_ms: number | null;
  status: string | null;
  error: string | null;
  // Router columns (migration 009) — absent on older rows / before the migration
  provider?: string | null;
  route_model?: string | null;
  route_cost_usd?: number | string | null;
  route_reason?: string | null;
}

export interface RoutingStats {
  /** Calls the router has an opinion on (shadow, applied, budget, unavailable). */
  routedCalls: number;
  /** What those calls cost vs. what the router's choice costs on the same tokens. */
  actualCost: number;
  routedCost: number;
  shadowSavings: number; // actual − routed, shadow-mode calls only
  byReason: { reason: string; calls: number; actualCost: number; routedCost: number }[];
  byProvider: { provider: string; calls: number; cost: number }[];
  fallbackCalls: number; // answered by OpenRouter after an Anthropic failure
  budgetDowngrades: number;
}

export interface GroupStats {
  key: string;
  calls: number;
  errors: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number | null;
}

export interface UsageReport {
  since: string;
  days: string[];
  totals: {
    cost: number;
    calls: number;
    errors: number;
    errorRate: number; // 0–100
    cacheHitRate: number | null; // 0–100, share of input tokens served from cache
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  seriesKeys: string[]; // stack order, biggest cost first; "Other" last if present
  daily: Record<string, number | string>[]; // { day, [seriesKey]: cost }
  byAgent: GroupStats[];
  byModel: GroupStats[];
  byUser: (GroupStats & { label?: string })[];
  recentErrors: { at: string; agent: string; model: string; error: string }[];
  routing: RoutingStats;
}

const MAX_SERIES = 7; // categorical palette slots; the rest fold into "Other"
const TZ = "America/New_York";

const n = (v: unknown) => {
  const x = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return isFinite(x) ? x : 0;
};

/** Who made the call: the agent when the fleet tagged one, else the script name. */
export const seriesKeyOf = (r: LlmCallRow) => r.agent || r.app || "unknown";

const dayOf = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function group(rows: LlmCallRow[], keyOf: (r: LlmCallRow) => string): GroupStats[] {
  const m = new Map<string, GroupStats & { latSum: number; latN: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = m.get(k) || { key: k, calls: 0, errors: 0, cost: 0, inputTokens: 0, outputTokens: 0, avgLatencyMs: null, latSum: 0, latN: 0 };
    g.calls++;
    if (r.status && r.status !== "ok") g.errors++;
    g.cost += n(r.cost_usd);
    g.inputTokens += n(r.input_tokens) + n(r.cache_read_tokens) + n(r.cache_write_tokens);
    g.outputTokens += n(r.output_tokens);
    if (r.latency_ms != null) {
      g.latSum += r.latency_ms;
      g.latN++;
    }
    m.set(k, g);
  }
  return [...m.values()]
    .map(({ latSum, latN, ...g }) => ({ ...g, avgLatencyMs: latN ? Math.round(latSum / latN) : null }))
    .sort((a, b) => b.cost - a.cost || b.calls - a.calls);
}

/** "shadow:agent:chamber_ash" -> "agent:chamber_ash" (mode prefix shown separately). */
const reasonKey = (r: string) => r.replace(/^shadow:/, "");

export function buildRoutingStats(rows: LlmCallRow[]): RoutingStats {
  const routed = rows.filter((r) => r.route_model && r.status === "ok");
  const reasons = new Map<string, { reason: string; calls: number; actualCost: number; routedCost: number }>();
  let shadowSavings = 0;
  for (const r of routed) {
    const key = reasonKey(r.route_reason || "unknown");
    const g = reasons.get(key) || { reason: key, calls: 0, actualCost: 0, routedCost: 0 };
    g.calls++;
    g.actualCost += n(r.cost_usd);
    g.routedCost += n(r.route_cost_usd);
    reasons.set(key, g);
    if ((r.route_reason || "").startsWith("shadow:")) shadowSavings += n(r.cost_usd) - n(r.route_cost_usd);
  }
  const providers = new Map<string, { provider: string; calls: number; cost: number }>();
  for (const r of rows) {
    const p = r.provider || "anthropic";
    const g = providers.get(p) || { provider: p, calls: 0, cost: 0 };
    g.calls++;
    g.cost += n(r.cost_usd);
    providers.set(p, g);
  }
  return {
    routedCalls: routed.length,
    actualCost: routed.reduce((s, r) => s + n(r.cost_usd), 0),
    routedCost: routed.reduce((s, r) => s + n(r.route_cost_usd), 0),
    shadowSavings,
    byReason: [...reasons.values()].sort((a, b) => b.calls - a.calls),
    byProvider: [...providers.values()].sort((a, b) => b.calls - a.calls),
    // OpenRouter calls the router didn't deliberately send there = Anthropic-failure fallbacks
    fallbackCalls: rows.filter((r) => r.provider === "openrouter" && !/^(app|agent):/.test(r.route_reason || "")).length,
    budgetDowngrades: routed.filter((r) => r.route_reason === "budget:member").length,
  };
}

export function buildUsageReport(rows: LlmCallRow[], sinceIso: string, days: number): UsageReport {
  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(dayOf(new Date(Date.now() - i * 86_400_000).toISOString()));

  const byAgent = group(rows, seriesKeyOf);
  const top = byAgent.slice(0, MAX_SERIES).map((g) => g.key);
  const hasOther = byAgent.length > MAX_SERIES;
  const seriesKeys = hasOther ? [...top, "Other"] : top;
  const seriesFor = (r: LlmCallRow) => (top.includes(seriesKeyOf(r)) ? seriesKeyOf(r) : "Other");

  const dailyMap = new Map<string, Record<string, number | string>>(
    [...new Set(dayList)].map((d) => [d, Object.fromEntries([["day", d], ...seriesKeys.map((k) => [k, 0])])])
  );
  for (const r of rows) {
    const row = dailyMap.get(dayOf(r.created_at));
    if (row) row[seriesFor(r)] = n(row[seriesFor(r)]) + n(r.cost_usd);
  }

  const cacheRead = rows.reduce((s, r) => s + n(r.cache_read_tokens), 0);
  const allInput = rows.reduce((s, r) => s + n(r.input_tokens) + n(r.cache_read_tokens) + n(r.cache_write_tokens), 0);
  const latencies = rows.map((r) => r.latency_ms).filter((x): x is number => x != null).sort((a, b) => a - b);
  const errors = rows.filter((r) => r.status && r.status !== "ok");

  return {
    since: sinceIso,
    days: [...dailyMap.keys()],
    totals: {
      cost: rows.reduce((s, r) => s + n(r.cost_usd), 0),
      calls: rows.length,
      errors: errors.length,
      errorRate: rows.length ? (errors.length / rows.length) * 100 : 0,
      cacheHitRate: allInput ? (cacheRead / allInput) * 100 : null,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
    },
    seriesKeys,
    daily: [...dailyMap.values()],
    byAgent,
    byModel: group(rows, (r) => r.model || "unknown"),
    byUser: group(rows.filter((r) => r.user_id), (r) => r.user_id as string).slice(0, 10),
    recentErrors: errors
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20)
      .map((r) => ({ at: r.created_at, agent: seriesKeyOf(r), model: r.model || "", error: (r.error || "").slice(0, 200) })),
    routing: buildRoutingStats(rows),
  };
}
