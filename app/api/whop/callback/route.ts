import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/access";
import { PKCE_COOKIE, exchangeCodeForUser, refreshWhopAccess, whopRedirectUri, type WhopIdentity } from "@/lib/whop";

export const dynamic = "force-dynamic";

/** Whop OAuth return: link the Whop account to this Chamber login, then check access. */
export async function GET(req: NextRequest) {
  const back = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url));
    res.cookies.set(PKCE_COOKIE, "", { path: "/api/whop", maxAge: 0 });
    return res;
  };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back("/login");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("/join?error=denied");

  let saved: { v?: string; s?: string; u?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(PKCE_COOKIE)?.value || "{}");
  } catch {}
  const code = params.get("code");
  if (!code || !saved.v || !saved.s || saved.s !== params.get("state") || saved.u !== user.id) {
    return back("/join?error=state");
  }

  const db = serviceClient();
  if (!db) return back("/join?error=config");

  let whop: WhopIdentity;
  try {
    whop = await exchangeCodeForUser(code, whopRedirectUri(req.nextUrl.origin), saved.v);
  } catch (e) {
    console.error("[whop] oauth exchange:", e);
    return back("/join?error=failed");
  }

  // One Whop account ↔ one Chamber login.
  const { data: existing } = await db.from("whop_links").select("user_id").eq("whop_user_id", whop.id).maybeSingle();
  if (existing && existing.user_id !== user.id) return back("/join?error=taken");

  const { error } = await db.from("whop_links").upsert(
    { user_id: user.id, whop_user_id: whop.id, whop_username: whop.username, whop_email: whop.email, linked_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("[whop] link save:", error.message);
    return back("/join?error=failed");
  }

  let hasAccess = false;
  try {
    hasAccess = await refreshWhopAccess(db, whop.id, { email: whop.email });
  } catch (e) {
    console.error("[whop] access check:", e);
  }
  return back(hasAccess ? "/dashboard" : "/join?connected=1");
}
