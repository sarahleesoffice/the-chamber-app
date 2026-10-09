import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin";
import { buildUsageReport, type LlmCallRow } from "@/lib/usage-stats";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = { "1d": 1, "7d": 7, "30d": 30 };
const PAGE = 1000; // PostgREST max rows per request
const MAX_ROWS = 50_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin-only LLM usage from public.llm_calls (Mac mini fleet's per-call log).
 * Non-admins get a 404 so the endpoint doesn't advertise itself.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Usage data isn't configured in this environment." }, { status: 503 });
  }
  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const days = RANGES[req.nextUrl.searchParams.get("range") || "7d"] ?? 7;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const rows: LlmCallRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await admin
      .from("llm_calls")
      .select("created_at, app, agent, user_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, status, error")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json({ error: "Usage data unavailable" }, { status: 502 });
    }
    rows.push(...((data as LlmCallRow[]) || []));
    if (!data || data.length < PAGE) break;
  }

  const report = buildUsageReport(rows, since, days);

  // Label web members (Supabase ids) with their email; Discord ids stay as-is.
  const byUser = await Promise.all(
    report.byUser.map(async (u) => {
      if (!UUID.test(u.key)) return { ...u, label: `Discord ${u.key}` };
      const { data } = await admin.auth.admin.getUserById(u.key);
      return { ...u, label: data?.user?.email || u.key };
    })
  );

  return NextResponse.json({ ...report, byUser, truncated: rows.length >= MAX_ROWS });
}
