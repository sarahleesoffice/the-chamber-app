import { NextRequest, NextResponse, after } from "next/server";
import { serviceClient } from "@/lib/access";
import { WebhookSignatureError, refreshWhopAccess, verifyWebhook } from "@/lib/whop";

export const dynamic = "force-dynamic";

interface WhopEvent {
  id?: string;
  type?: string;
  data?: Record<string, unknown> & {
    id?: string;
    user_id?: string;
    user?: { id?: string; email?: string };
    product_id?: string;
    product?: { id?: string };
    membership_id?: string;
    membership?: { id?: string };
    status?: string;
    current_period_end?: string | number | null;
  };
}

const HANDLED = /^(membership\.|payment\.(failed|succeeded)$|invoice\.past_due$)/;

function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Whop webhook: membership / payment changes. Verifies the Standard Webhooks
 * signature, dedupes by webhook-id (Whop retries, at-least-once), answers fast,
 * then re-checks the member's access with Whop after the response is sent.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  const db = serviceClient();
  if (!secret || !db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const raw = await req.text();
  let event: WhopEvent;
  try {
    event = verifyWebhook(raw, req.headers, secret) as WhopEvent;
  } catch (e) {
    if (e instanceof WebhookSignatureError) return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const type = event.type || "";
  const eventId = req.headers.get("webhook-id") || event.id || "";
  if (!HANDLED.test(type)) return NextResponse.json({ ok: true, ignored: type });
  if (!eventId) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  const { error: insertErr } = await db.from("whop_webhook_events").insert({ id: eventId, type });
  if (insertErr?.code === "23505") return NextResponse.json({ ok: true, duplicate: true }); // already processed
  if (insertErr) {
    console.error("[whop] webhook event log:", insertErr.message);
    return NextResponse.json({ error: "Storage unavailable" }, { status: 500 }); // Whop will retry
  }

  const d = event.data || {};
  const productId = d.product_id || d.product?.id;
  if (productId && process.env.WHOP_PRODUCT_ID && productId !== process.env.WHOP_PRODUCT_ID) {
    return NextResponse.json({ ok: true, ignored: "other product" });
  }
  const whopUserId = d.user_id || d.user?.id;
  if (!whopUserId) return NextResponse.json({ ok: true, ignored: "no user" });

  const isMembership = type.startsWith("membership.");
  const extra = {
    status: isMembership
      ? d.status ?? null
      : type === "payment.succeeded" ? "active" : "past_due", // payment.failed / invoice.past_due
    membership_id: isMembership ? d.id ?? null : d.membership_id || d.membership?.id || null,
    current_period_end: isMembership ? isoOrNull(d.current_period_end) : null,
    email: d.user?.email ?? null,
  };

  after(async () => {
    try {
      await refreshWhopAccess(db, String(whopUserId), extra);
    } catch (e) {
      // getAccess re-checks stale rows, so a miss here self-heals within hours.
      console.error("[whop] webhook access refresh:", type, e);
    }
  });
  return NextResponse.json({ ok: true });
}
