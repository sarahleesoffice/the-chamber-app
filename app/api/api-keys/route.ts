import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProvider, saveUserApiKey, deleteUserApiKey } from "@/lib/api-keys";

/**
 * Save (POST) or remove (DELETE) the signed-in user's AI provider key.
 * The key is encrypted server-side before it is stored and is never echoed
 * back to the browser.
 *
 * Body: { provider: "anthropic" | "gemini" | "openai" | "openrouter", key?: string }
 */

export const dynamic = "force-dynamic";

const MAX_KEY_LENGTH = 512;

async function authenticate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticate();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const provider = body?.provider;
    const key = typeof body?.key === "string" ? body.key.trim() : "";

    if (!isProvider(provider)) {
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }
    if (!key || key.length > MAX_KEY_LENGTH || /\s/.test(key)) {
      return NextResponse.json({ error: "Please enter a valid API key." }, { status: 400 });
    }

    await saveUserApiKey(user.id, provider, key);
    return NextResponse.json({ ok: true, provider });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticate();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const provider = body?.provider;
    if (!isProvider(provider)) {
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    await deleteUserApiKey(user.id, provider);
    return NextResponse.json({ ok: true, provider });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
