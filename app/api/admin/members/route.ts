import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { normalizeEmail, paywallEnforced, serviceClient } from "@/lib/access";

export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function adminDb() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Non-admins get a 404 so the endpoint doesn't advertise itself.
  if (!isAdmin(user)) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  const db = serviceClient();
  if (!db) return { error: NextResponse.json({ error: "Member data isn't configured in this environment." }, { status: 503 }) };
  return { db, user: user! };
}

/** Lifetime list + Whop-linked members, for /admin/members. */
export async function GET() {
  const ctx = await adminDb();
  if ("error" in ctx) return ctx.error;
  const { db } = ctx;

  const [lifetime, links, whopAccess] = await Promise.all([
    db.from("lifetime_access").select("email, note, granted_by, created_at").order("created_at", { ascending: false }),
    db.from("whop_links").select("user_id, whop_user_id, whop_username, whop_email, linked_at"),
    db.from("whop_access").select("whop_user_id, has_access, status, current_period_end, email, checked_at").order("checked_at", { ascending: false }),
  ]);
  if (lifetime.error || links.error || whopAccess.error) {
    return NextResponse.json({ error: "Member tables aren't set up yet — run migration 010." }, { status: 502 });
  }

  const linkByWhop = new Map((links.data || []).map((l) => [l.whop_user_id, l]));
  const whop = (whopAccess.data || []).map((m) => {
    const link = linkByWhop.get(m.whop_user_id);
    return { ...m, email: m.email || link?.whop_email || null, username: link?.whop_username || null, linked: !!link };
  });

  return NextResponse.json({
    enforced: paywallEnforced(),
    lifetime: lifetime.data || [],
    whop,
  });
}

/** Add one or more lifetime emails: { emails: "a@x.com, b@y.com", note?: string } */
export async function POST(req: NextRequest) {
  const ctx = await adminDb();
  if ("error" in ctx) return ctx.error;
  const { db, user } = ctx;

  const body = await req.json().catch(() => ({}));
  const raw = String(body.emails || "");
  const note = String(body.note || "").slice(0, 200);
  const emails = [...new Set(raw.split(/[\s,;]+/).map(normalizeEmail).filter(Boolean))];
  const bad = emails.filter((e) => !EMAIL.test(e));
  if (!emails.length || bad.length) {
    return NextResponse.json({ error: bad.length ? `Not an email: ${bad.join(", ")}` : "Add at least one email." }, { status: 400 });
  }

  const { error } = await db
    .from("lifetime_access")
    .upsert(emails.map((email) => ({ email, note, granted_by: user.email })), { onConflict: "email", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: "Couldn't save — is migration 010 applied?" }, { status: 502 });
  return NextResponse.json({ added: emails });
}

/** Remove a lifetime email: DELETE ?email=a@x.com */
export async function DELETE(req: NextRequest) {
  const ctx = await adminDb();
  if ("error" in ctx) return ctx.error;
  const email = normalizeEmail(req.nextUrl.searchParams.get("email") || "");
  if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
  const { error } = await ctx.db.from("lifetime_access").delete().eq("email", email);
  if (error) return NextResponse.json({ error: "Couldn't remove." }, { status: 502 });
  return NextResponse.json({ removed: email });
}
