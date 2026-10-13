import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin";
import { refreshWhopAccess } from "@/lib/whop";

const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * Who gets into the paid app (see supabase/migrations/010_chamber_access.sql).
 *
 * Env:
 *   PAYWALL_ENFORCED — "true" to lock the app. Anything else = open to every
 *                      logged-in user (so lifetime friends can be added first).
 *   Whop settings live in lib/whop.ts.
 */

export type AccessReason = "open" | "admin" | "lifetime" | "whop" | "none";

export interface Access {
  allowed: boolean;
  reason: AccessReason;
  /** Set when the user has linked a Whop account. */
  whopLinked: boolean;
  /** Latest Whop membership status, e.g. "trialing", "active", "past_due". */
  whopStatus?: string | null;
}

export function paywallEnforced(): boolean {
  return process.env.PAYWALL_ENFORCED === "true";
}

export function serviceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false },
  });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getAccess(user: User): Promise<Access> {
  const enforced = paywallEnforced();
  if (isAdmin(user)) return { allowed: true, reason: "admin", whopLinked: false };

  const db = serviceClient();
  if (!db) {
    // Can't read access tables — fail closed only when the paywall is on.
    return { allowed: !enforced, reason: enforced ? "none" : "open", whopLinked: false };
  }

  // Lifetime list is keyed by email, so only trust a confirmed address.
  if (user.email && user.email_confirmed_at) {
    const { data } = await db
      .from("lifetime_access")
      .select("email")
      .eq("email", normalizeEmail(user.email))
      .maybeSingle();
    if (data) return { allowed: true, reason: "lifetime", whopLinked: false };
  }

  const { data: link } = await db
    .from("whop_links")
    .select("whop_user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let whopStatus: string | null = null;
  if (link?.whop_user_id) {
    const { data: row } = await db
      .from("whop_access")
      .select("has_access, status, checked_at")
      .eq("whop_user_id", link.whop_user_id)
      .maybeSingle();
    let hasAccess = !!row?.has_access;
    whopStatus = row?.status ?? null;

    // Webhooks keep this fresh; re-ask Whop if we haven't heard in a while
    // (missed webhook, or a renewal we never got told about).
    const stale = !row || Date.now() - new Date(row.checked_at).getTime() > STALE_MS;
    if (stale) {
      try {
        hasAccess = await refreshWhopAccess(db, link.whop_user_id);
      } catch {
        // Whop unreachable — keep the last known answer.
      }
    }
    if (hasAccess) return { allowed: true, reason: "whop", whopLinked: true, whopStatus };
  }

  return {
    allowed: !enforced,
    reason: enforced ? "none" : "open",
    whopLinked: !!link?.whop_user_id,
    whopStatus,
  };
}

/**
 * For paid API routes: returns a 402 response when the user has no access,
 * or null when they may continue. Call after confirming the user is logged in.
 */
export async function accessDenied(user: User): Promise<NextResponse | null> {
  const access = await getAccess(user);
  if (access.allowed) return null;
  return NextResponse.json(
    { error: "This is for Chamber members. Start your free trial or connect your Whop account.", join: "/join" },
    { status: 402 }
  );
}
