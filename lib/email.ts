/**
 * Outgoing email through Resend's HTTP API (the same Resend account Supabase
 * uses for auth emails; the-chamber.app is a verified sending domain there).
 *
 * Env:
 *   RESEND_API_KEY      — Resend API key (sending access is enough)
 *   EMAIL_FROM          — optional, default "SJ from The Chamber <sj@the-chamber.app>"
 *   EMAIL_REPLY_TO      — optional, default support@chamber.trading
 *   MAIL_POSTAL_ADDRESS — mailing address for the footer. US law (CAN-SPAM)
 *                         requires one in marketing emails, so the follow-up
 *                         series doesn't send until it's set.
 */

const FROM = process.env.EMAIL_FROM || "SJ from The Chamber <sj@the-chamber.app>";
const REPLY_TO = process.env.EMAIL_REPLY_TO || "support@chamber.trading";

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function postalAddress(): string | null {
  return process.env.MAIL_POSTAL_ADDRESS?.trim() || null;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** One-click unsubscribe URL (POST), sent as List-Unsubscribe headers. */
  unsubscribeUrl?: string;
}

export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");

  const headers: Record<string, string> = {};
  if (msg.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${msg.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [msg.to],
      reply_to: REPLY_TO,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      headers,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend send failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
