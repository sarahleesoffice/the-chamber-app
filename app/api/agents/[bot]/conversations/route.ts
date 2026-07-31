import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BOTS = new Set(["ember", "amber"]);

/**
 * Lists the signed-in user's archived web conversations with an agent.
 * Conversations are derived from agent_conversations channels
 * (web-<user_id> for the original thread, web-<user_id>-c… for the rest) —
 * read-only, the agent service owns the table.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ bot: string }> }
) {
  const { bot } = await params;
  if (!BOTS.has(bot)) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ conversations: [] });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  const { data, error } = await admin
    .from("agent_conversations")
    .select("channel_id, role, content, created_at")
    .eq("bot_name", bot)
    .like("channel_id", `web-${user.id}%`)
    .order("created_at", { ascending: true })
    .limit(3000);

  if (error) {
    return NextResponse.json({ error: "Archive unavailable" }, { status: 502 });
  }

  const basePrefix = `web-${user.id}`;
  const byConvo = new Map<string, { title: string; lastAt: string; count: number }>();

  for (const r of data ?? []) {
    const suffix = r.channel_id === basePrefix ? "main" : r.channel_id.slice(basePrefix.length + 1);
    if (suffix !== "main" && !/^c[a-z0-9]{4,31}$/.test(suffix)) continue;

    const c = r.content as unknown;
    const text =
      typeof c === "string"
        ? c
        : c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string"
          ? (c as { text: string }).text
          : "";

    const existing = byConvo.get(suffix);
    if (!existing) {
      byConvo.set(suffix, {
        title: r.role === "user" && text ? text.slice(0, 60) : "Conversation",
        lastAt: r.created_at as string,
        count: 1,
      });
    } else {
      if (existing.title === "Conversation" && r.role === "user" && text) existing.title = text.slice(0, 60);
      existing.lastAt = r.created_at as string;
      existing.count += 1;
    }
  }

  const conversations = [...byConvo.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

  return NextResponse.json({ conversations });
}
