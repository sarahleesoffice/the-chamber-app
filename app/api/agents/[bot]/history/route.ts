import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const BOTS = new Set(["ember", "amber"]);

/**
 * Returns the signed-in user's past web conversation with an agent.
 * Read-only: the Mac mini agent service owns agent_conversations — the web
 * app only displays the user's own thread (channel web-<user_id>).
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
    // History simply unavailable in this environment — chat still works.
    return NextResponse.json({ messages: [] });
  }

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  const { data, error } = await admin
    .from("agent_conversations")
    .select("role, content, created_at")
    .eq("bot_name", bot)
    .eq("channel_id", `web-${user.id}`)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: "History unavailable" }, { status: 502 });
  }

  const messages = (data ?? [])
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => {
      const c = r.content as unknown;
      const text =
        typeof c === "string"
          ? c
          : c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string"
            ? (c as { text: string }).text
            : "";
      return { role: r.role as "user" | "assistant", content: text, timestamp: r.created_at as string };
    })
    .filter((m) => m.content);

  return NextResponse.json({ messages });
}
