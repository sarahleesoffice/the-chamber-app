import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

// Only same-site paths ("/x"), never "//host" or "@host" tricks.
const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard");

/**
 * Email links (confirm signup, reset password) open /auth/confirm on our own
 * domain, and the button there POSTs here. The one-time token is only spent on
 * that POST: email scanners that prefetch links (GET) can't burn it, which is
 * what made reset links show "otp_expired" before the person clicked.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") || "");
  const type = String(form.get("type") || "") as EmailOtpType;
  const next = safeNext(String(form.get("next") || ""));

  if (tokenHash && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`, 303);
  }

  // Expired or already-used link.
  const fallback = type === "recovery" ? "/forgot-password?expired=1" : "/login?error=auth";
  return NextResponse.redirect(`${origin}${fallback}`, 303);
}

/** Old-style links that point straight here: send them to the button page. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(`${url.origin}/auth/confirm${url.search}`);
}
