import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Whop integration: "Connect Whop" OAuth (PKCE), server-side access checks and
 * webhook verification. Plain fetch — the SDK has no OAuth helper and we only
 * need three endpoints. Docs: docs.whop.com/developer/guides/oauth,
 * api-reference/beta/users/check-user-access, developer/guides/webhooks.
 *
 * Env (Vercel + .env.local):
 *   WHOP_API_KEY        — company API key (server only)
 *   WHOP_PRODUCT_ID     — The Chamber's product id (prod_...)
 *   WHOP_CLIENT_ID      — OAuth app client id (app_...)
 *   WHOP_WEBHOOK_SECRET — webhook signing secret (ws_...)
 *   WHOP_REDIRECT_URI   — optional; defaults to <site>/api/whop/callback
 */

const API = "https://api.whop.com";

export const PKCE_COOKIE = "whop_oauth";

/** Must exactly match a redirect URI registered on the Whop OAuth app. */
export function whopRedirectUri(origin: string): string {
  return process.env.WHOP_REDIRECT_URI || `${origin}/api/whop/callback`;
}

export function whopOAuthConfigured(): boolean {
  return !!process.env.WHOP_CLIENT_ID;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function newPkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(randomBytes(16)), nonce: b64url(randomBytes(16)) };
}

export function authorizeUrl(redirectUri: string, p: { challenge: string; state: string; nonce: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WHOP_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  });
  return `${API}/oauth/authorize?${q}`;
}

export interface WhopIdentity {
  id: string; // user_...
  email: string | null;
  username: string | null;
}

/** Exchange the OAuth code and return who the Whop user is. */
export async function exchangeCodeForUser(code: string, redirectUri: string, verifier: string): Promise<WhopIdentity> {
  const tokenRes = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.WHOP_CLIENT_ID,
      code_verifier: verifier,
    }),
  });
  if (!tokenRes.ok) throw new Error(`Whop token exchange failed (${tokenRes.status})`);
  const { access_token } = await tokenRes.json();

  const infoRes = await fetch(`${API}/oauth/userinfo`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new Error(`Whop userinfo failed (${infoRes.status})`);
  const info = await infoRes.json();
  if (!info.sub) throw new Error("Whop userinfo had no user id");
  return {
    id: String(info.sub),
    email: info.email_verified === false ? null : info.email ?? null,
    username: info.preferred_username ?? null,
  };
}

/** Whop's own answer to "can this user access The Chamber right now?" */
export async function checkWhopAccess(whopUserId: string): Promise<boolean> {
  const key = process.env.WHOP_API_KEY;
  const productId = process.env.WHOP_PRODUCT_ID;
  if (!key || !productId) throw new Error("WHOP_API_KEY / WHOP_PRODUCT_ID not set");
  const res = await fetch(
    `${API}/api/v1/users/${encodeURIComponent(whopUserId)}/access/${encodeURIComponent(productId)}`,
    { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000), cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Whop access check failed (${res.status})`);
  const body = await res.json();
  return body.has_access === true;
}

/** Re-check with Whop and store the answer. Extra membership fields are optional context. */
export async function refreshWhopAccess(
  db: SupabaseClient,
  whopUserId: string,
  extra: { status?: string | null; membership_id?: string | null; current_period_end?: string | null; email?: string | null } = {}
): Promise<boolean> {
  const hasAccess = await checkWhopAccess(whopUserId);
  const row: Record<string, unknown> = {
    whop_user_id: whopUserId,
    has_access: hasAccess,
    product_id: process.env.WHOP_PRODUCT_ID,
    checked_at: new Date().toISOString(),
  };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) row[k] = v;
  await db.from("whop_access").upsert(row, { onConflict: "whop_user_id" });
  return hasAccess;
}

export class WebhookSignatureError extends Error {}

/**
 * Standard Webhooks verification as Whop does it: HMAC-SHA256 keyed with the
 * literal bytes of the ws_ secret (no base64 decode, prefix kept) over
 * "{webhook-id}.{webhook-timestamp}.{raw body}". Mirrors @whop/sdk's unwrapWebhook.
 */
export function verifyWebhook(rawBody: string, headers: Headers, secret: string, toleranceSec = 300): unknown {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !ts || !sigHeader) throw new WebhookSignatureError("missing signature headers");

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > toleranceSec) {
    throw new WebhookSignatureError("timestamp outside tolerance");
  }

  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(`${id}.${ts}.${rawBody}`).digest();
  const ok = sigHeader.split(" ").some((part) => {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new WebhookSignatureError("signature mismatch");
  return JSON.parse(rawBody);
}
