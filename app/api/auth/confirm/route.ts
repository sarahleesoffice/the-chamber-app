import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Email links (confirm signup, reset password) land here on our own domain —
 * the Supabase email templates point at
 *   {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 * instead of the supabase.co verify URL, so the link matches the sender domain
 * (a mismatched link domain is what gets these flagged as phishing).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/dashboard";
  // Only same-site paths ("/x"), never "//host" or "@host" tricks.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  // Expired or already-used link.
  const fallback = type === "recovery" ? "/forgot-password?expired=1" : "/login?error=auth";
  return NextResponse.redirect(`${origin}${fallback}`);
}
