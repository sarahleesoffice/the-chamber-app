import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/access";
import { emailConfigured, postalAddress, sendEmail } from "@/lib/email";
import { SEQUENCE, nextEmailAt, oneClickUnsubscribeUrl, renderEmail } from "@/lib/free-lessons";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 60;
const GAP_MS = 600; // stay under Resend's default 2 requests/second

/**
 * Daily Vercel cron (vercel.json): sends each lead the next email in the
 * free-lessons series once it's due. Vercel calls it with
 * "Authorization: Bearer $CRON_SECRET". Leads left over past BATCH go out on
 * the next run.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) return NextResponse.json({ skipped: "RESEND_API_KEY not set" });
  // Marketing emails need a mailing address in the footer (CAN-SPAM).
  if (!postalAddress()) return NextResponse.json({ skipped: "MAIL_POSTAL_ADDRESS not set" });

  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { data: due, error } = await db
    .from("free_leads")
    .select("email, unsubscribe_token, sequence_step, created_at")
    .lte("next_email_at", new Date().toISOString())
    .is("unsubscribed_at", null)
    .order("next_email_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const lead of due ?? []) {
    const step = lead.sequence_step as number;
    const content = SEQUENCE[step];
    if (!content) {
      await db.from("free_leads").update({ next_email_at: null }).eq("email", lead.email);
      continue;
    }
    try {
      const { subject, html, text } = renderEmail(content, lead.unsubscribe_token);
      await sendEmail({ to: lead.email, subject, html, text, unsubscribeUrl: oneClickUnsubscribeUrl(lead.unsubscribe_token) });
      // Never more than one email a day, even for someone who fell behind.
      const scheduled = nextEmailAt(new Date(lead.created_at), step + 1);
      const tomorrow = new Date(Date.now() + 23 * 60 * 60 * 1000);
      const next = scheduled && scheduled < tomorrow ? tomorrow : scheduled;
      await db
        .from("free_leads")
        .update({ sequence_step: step + 1, next_email_at: next?.toISOString() ?? null })
        .eq("email", lead.email);
      sent++;
    } catch (e) {
      failed++;
      console.error("[free] sequence email:", lead.email, e);
    }
    await new Promise((r) => setTimeout(r, GAP_MS));
  }

  return NextResponse.json({ due: due?.length ?? 0, sent, failed });
}
