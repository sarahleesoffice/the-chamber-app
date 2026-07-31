import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Proxy to the Ember/Amber agents running on the Mac mini.
 *
 * The agents live behind a FastAPI wrapper exposed through a Cloudflare tunnel.
 * This route authenticates the Chamber user via their Supabase session, then
 * forwards a server-to-server request with a shared secret — so the secret and
 * the tunnel URL never reach the browser.
 *
 * Configure via env (set locally in .env.local AND on Vercel):
 *   AGENT_API_URL    — tunnel base, e.g. https://agents.example.com
 *   AGENT_API_SECRET — shared secret matching ember-bot's EMBER_BOT_SECRET
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOTS = new Set(["ember", "amber"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bot: string }> }
) {
  const { bot } = await params;

  if (!BOTS.has(bot)) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const baseUrl = process.env.AGENT_API_URL;
  const secret = process.env.AGENT_API_SECRET;
  if (!baseUrl || !secret) {
    return NextResponse.json(
      { error: `${bot === "ember" ? "Ember" : "Amber"} isn't connected yet. The agent backend hasn't been configured.` },
      { status: 503 }
    );
  }

  let message: string;
  let conversationId = "main";
  try {
    const body = await req.json();
    message = typeof body.message === "string" ? body.message.trim() : "";
    if (typeof body.conversationId === "string" && /^(main|c[a-z0-9]{4,31})$/.test(body.conversationId)) {
      conversationId = body.conversationId;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  // The agent keeps its own conversation history in Supabase keyed by
  // channel_id. Each web conversation maps to its own channel, so context is
  // scoped per conversation ("main" is the original pre-archive thread).
  const channelId = conversationId === "main" ? `web-${user.id}` : `web-${user.id}-${conversationId}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/agents/${bot}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Chamber-Secret": secret,
      },
      body: JSON.stringify({
        user_id: user.id,
        user_display_name: user.email || "Web User",
        channel_id: channelId,
        message,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const detail = data && typeof data.error === "string" ? data.error : `Agent error (${res.status})`;
      return NextResponse.json({ error: detail }, { status: 502 });
    }
    if (!data || typeof data.reply !== "string") {
      return NextResponse.json({ error: "Agent returned an unexpected response" }, { status: 502 });
    }

    return NextResponse.json({ reply: data.reply });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: aborted ? "The agent took too long to respond. Try again." : "Couldn't reach the agent. It may be offline." },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
