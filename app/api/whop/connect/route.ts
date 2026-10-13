import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PKCE_COOKIE, authorizeUrl, newPkce, whopOAuthConfigured, whopRedirectUri } from "@/lib/whop";

export const dynamic = "force-dynamic";

/** "Connect your Whop account": start Whop OAuth (PKCE) for the logged-in user. */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!whopOAuthConfigured()) return NextResponse.redirect(new URL("/join?error=config", req.url));

  const pkce = newPkce();
  const res = NextResponse.redirect(authorizeUrl(whopRedirectUri(req.nextUrl.origin), pkce));
  res.cookies.set(PKCE_COOKIE, JSON.stringify({ v: pkce.verifier, s: pkce.state, u: user.id }), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/whop",
    maxAge: 600,
  });
  return res;
}
