import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin";
import { buildQuestionReport, type MessageTagRow } from "@/lib/question-stats";

export const dynamic = "force-dynamic";

const RANGES: Record<string, number> = { "7d": 7, "30d": 30, all: 3650 };
const PAGE = 1000; // PostgREST max rows per request
const MAX_ROWS = 20_000;

/**
 * Admin-only "what people ask" report from public.message_tags (tagged
 * nightly on the Mac mini). Non-admins get a 404, like /api/admin/usage.
 * ?owner=1 includes SJ's own messages (excluded by default).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Question data isn't configured in this environment." }, { status: 503 });
  }
  const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });

  const days = RANGES[req.nextUrl.searchParams.get("range") || "30d"] ?? 30;
  const includeOwner = req.nextUrl.searchParams.get("owner") === "1";
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const rows: MessageTagRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let q = admin
      .from("message_tags")
      .select("asked_at, bot_name, user_id, is_owner, channel_kind, topic, difficulty, best_agent, needs_live_data, summary")
      .gte("asked_at", since)
      .order("asked_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (!includeOwner) q = q.eq("is_owner", false);
    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: "Question data unavailable" }, { status: 502 });
    }
    rows.push(...((data as MessageTagRow[]) || []));
    if (!data || data.length < PAGE) break;
  }

  return NextResponse.json({ ...buildQuestionReport(rows), truncated: rows.length >= MAX_ROWS });
}
