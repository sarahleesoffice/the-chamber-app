import { NextResponse, after } from "next/server";
import { randomBytes } from "crypto";
import { normalizeEmail, serviceClient } from "@/lib/access";
import { emailConfigured, sendEmail } from "@/lib/email";
import { SEQUENCE, cleanSource, inviteFor, nextEmailAt, oneClickUnsubscribeUrl, renderEmail, welcomeEmail } from "@/lib/free-lessons";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const WELCOME_RESEND_MS = 60 * 60 * 1000;

/**
 * /free form posts here. Saves the email, sends the welcome email after the
 * response, and always lands on /free/thanks (which has the Discord button),
 * so a slow or failed email never blocks someone from the lessons.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const email = normalizeEmail(String(form.get("email") || ""));
  const source = cleanSource(String(form.get("src") || ""));
  const thanks = NextResponse.redirect(`${origin}/free/thanks?src=${source}`, 303);

  // Bots fill every field; people never see this one.
  if (String(form.get("company") || "")) return thanks;

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.redirect(`${origin}/free?error=email&src=${source}`, 303);
  }

  const db = serviceClient();
  if (!db) {
    console.error("[free] SUPABASE_SERVICE_ROLE_KEY not set");
    return thanks;
  }

  const now = new Date();
  const { data: existing } = await db
    .from("free_leads")
    .select("source, unsubscribe_token, welcome_sent_at, unsubscribed_at, sequence_step")
    .eq("email", email)
    .maybeSingle();

  let token: string;
  let sendWelcome: boolean;
  let leadSource = source;
  if (existing) {
    token = existing.unsubscribe_token;
    leadSource = existing.source;
    const lastWelcome = existing.welcome_sent_at ? new Date(existing.welcome_sent_at).getTime() : 0;
    sendWelcome = now.getTime() - lastWelcome > WELCOME_RESEND_MS;
    if (existing.unsubscribed_at) {
      // Signed up again after unsubscribing: they want the emails back.
      const next = existing.sequence_step < SEQUENCE.length ? new Date(now.getTime() + DAY_MS).toISOString() : null;
      await db.from("free_leads").update({ unsubscribed_at: null, next_email_at: next }).eq("email", email);
    }
  } else {
    token = randomBytes(24).toString("hex");
    sendWelcome = true;
    const { error } = await db.from("free_leads").insert({
      email,
      source,
      unsubscribe_token: token,
      next_email_at: nextEmailAt(now, 0)?.toISOString() ?? null,
    });
    if (error && error.code !== "23505") {
      console.error("[free] save lead:", error.message);
      return thanks;
    }
  }

  if (sendWelcome && emailConfigured()) {
    after(async () => {
      try {
        const { subject, html, text } = renderEmail(welcomeEmail(inviteFor(leadSource)), token);
        await sendEmail({ to: email, subject, html, text, unsubscribeUrl: oneClickUnsubscribeUrl(token) });
        await db.from("free_leads").update({ welcome_sent_at: new Date().toISOString() }).eq("email", email);
      } catch (e) {
        console.error("[free] welcome email:", e);
      }
    });
  }

  return thanks;
}
