import { escapeHtml, postalAddress } from "@/lib/email";

/**
 * Free SMC lessons opt-in: the links it hands out and the emails it sends.
 *
 * Env (optional):
 *   FREE_DISCORD_INVITE          — invite in the emails and on /free/thanks
 *   NEXT_PUBLIC_WHOP_CHECKOUT_URL — paid plan checkout (same as /join)
 *   NEXT_PUBLIC_SITE_URL          — public origin for links in emails
 */

export const DISCORD_INVITE = process.env.FREE_DISCORD_INVITE || "https://discord.gg/E8arTHK4zb";
export const CHECKOUT_URL =
  process.env.NEXT_PUBLIC_WHOP_CHECKOUT_URL || "https://whop.com/the-chamber-895d/the-chamber-d3-4196/";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.the-chamber.app").replace(/\/$/, "");

/** Discord invite per source, so Discord's invite counts show where joins came from. */
const SOURCE_INVITES: Record<string, string> = {
  ig: "https://discord.gg/ZKrJdh9yV3",
  tiktok: "https://discord.gg/U8t3hEDzs8",
  clip: "https://discord.gg/44gebv2h9E",
};

export function inviteFor(source: string): string {
  return SOURCE_INVITES[source] || DISCORD_INVITE;
}

/** Where a signup came from: the ?src= on /free, kept short and safe. */
export function cleanSource(v: string | null | undefined): string {
  const s = (v || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  return s || "site";
}

type Block = { p: string } | { button: { label: string; url: string } } | { list: string[] };

interface EmailContent {
  subject: string;
  preview: string;
  blocks: Block[];
}

export interface SequenceEmail extends EmailContent {
  /** Days after signup this one goes out. */
  day: number;
}

export const welcomeEmail = (invite: string): EmailContent => ({
  subject: "Your free SMC lessons are in here",
  preview: "Join the Discord and open the STUDY section.",
  blocks: [
    { p: "Hey, it's SJ. Here's your access to the free lessons:" },
    { button: { label: "Join the free Discord", url: invite } },
    { p: "Once you're in, open the STUDY section and go in this order:" },
    {
      list: [
        "#the-basics: start here, even if you've traded before",
        "#intermediate: once the basics click",
        "#models: full setups, step by step",
        "#abbreviations: whenever a term loses you",
      ],
    },
    { p: "All of it is free, and it stays free." },
    { p: "Over the next week I'll send you a few short emails: where to start, how I actually trade, and the AI mentors I built for the community." },
    { p: "SJ" },
  ],
});

export const SEQUENCE: SequenceEmail[] = [
  {
    day: 1,
    subject: "Start here (don't skip this one)",
    preview: "One lesson, one chart, today.",
    blocks: [
      { p: "Quick one." },
      { p: "Most people join a trading community, save 40 videos and watch none of them. Don't do that." },
      { p: "Today, do two things:" },
      {
        list: [
          "Watch the first lesson in #the-basics. Just one.",
          "Open a chart and mark the one thing that lesson taught you. Screenshot it.",
        ],
      },
      { p: "That's it. One lesson and one chart beats ten lessons you half remember." },
      { button: { label: "Open the Discord", url: DISCORD_INVITE } },
      { p: "SJ" },
    ],
  },
  {
    day: 3,
    subject: "Why my best trading days are boring",
    preview: "Calm beats busy.",
    blocks: [
      { p: "My best trading days look boring from the outside." },
      { p: "I mark up before the open, wait for one setup I know, take it or don't, and close the laptop. No screaming at candles, no ten trades to win back the first one." },
      { p: "That isn't talent. It's rules:" },
      {
        list: [
          "One setup I know well, not five I sort of know",
          "Risk decided before I click, never after",
          "If I break a rule, I'm done for the day",
        ],
      },
      { p: "The lessons in the Discord are built around the same idea: learn a few things deeply and trade them patiently." },
      { p: "SJ" },
      { p: "P.S. Trading is risky and most people lose money. Nothing here is financial advice." },
    ],
  },
  {
    day: 5,
    subject: "I built an AI that reviews my charts",
    preview: "Meet Ember and Amber.",
    blocks: [
      { p: "Something I haven't told you about yet." },
      { p: "Inside The Chamber there are AI mentors I built for the community:" },
      {
        list: [
          "Ember, the SMC chart mentor. Send it a chart and it breaks down structure, liquidity and the setup, and points you to the lesson that covers it.",
          "Amber, the trading psychology mentor. For the days you're about to revenge trade.",
          "Ash, the member support guide. Questions about the community, the app, where things are.",
        ],
      },
      { p: "They're there at 2am when nobody in the chat is awake, and they're private: your questions stay between you and the mentor." },
      { p: "Members also get the Chamber app: trade journal, performance analytics and the Edge Report." },
      { p: "In two days I'll send you a way to try all of it free." },
      { p: "SJ" },
    ],
  },
  {
    day: 7,
    subject: "Try the AI mentors free for 7 days",
    preview: "Ember, Amber, Ash and the app. Cancel anytime.",
    blocks: [
      { p: "As promised." },
      { p: "You can try everything members get, free for 7 days:" },
      {
        list: [
          "Ember, Amber and Ash, the AI mentors",
          "The members-only channels",
          "The Chamber app: journal, analytics, Edge Report",
        ],
      },
      { button: { label: "Start my 7-day free trial", url: CHECKOUT_URL } },
      { p: "After the trial it's $39.99/month or $400/year. Cancel anytime before day 8 and you won't be charged. The free lessons stay free either way." },
      { p: "SJ" },
      { p: "Trading involves risk. Nothing here is financial advice or a promise of results." },
    ],
  },
];

/** The footer link: a page with a button, so link scanners can't unsubscribe anyone. */
export function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/free/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click target for the List-Unsubscribe header (mail apps POST here). */
export function oneClickUnsubscribeUrl(token: string): string {
  return `${SITE_URL}/api/free/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** Renders an email to html + plain text with the standard footer. */
export function renderEmail(content: EmailContent, token: string): { subject: string; html: string; text: string } {
  const unsub = unsubscribeUrl(token);
  const address = postalAddress();

  const htmlBlocks = content.blocks
    .map((b) => {
      if ("p" in b) return `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1a1a1a">${escapeHtml(b.p)}</p>`;
      if ("list" in b)
        return `<ul style="margin:0 0 16px;padding-left:20px;font-size:16px;line-height:1.55;color:#1a1a1a">${b.list
          .map((li) => `<li style="margin-bottom:6px">${escapeHtml(li)}</li>`)
          .join("")}</ul>`;
      return `<p style="margin:8px 0 24px"><a href="${escapeHtml(b.button.url)}" style="display:inline-block;background:#e8651a;color:#000;font-weight:700;text-decoration:none;padding:14px 22px;border-radius:8px;font-size:16px">${escapeHtml(b.button.label)}</a></p>`;
    })
    .join("\n");

  const footerLines = [
    "You're getting this because you asked for the free SMC lessons from The Chamber.",
    address,
    "Not financial advice. Trading involves risk.",
  ].filter(Boolean) as string[];

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f4">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preview)}</span>
<div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<p style="margin:0 0 24px;font-size:13px;letter-spacing:3px;font-weight:700;color:#e8651a">THE CHAMBER</p>
${htmlBlocks}
<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 16px">
${footerLines.map((l) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#777">${escapeHtml(l)}</p>`).join("")}
<p style="margin:0;font-size:12px;color:#777"><a href="${escapeHtml(unsub)}" style="color:#777">Unsubscribe</a></p>
</div></body></html>`;

  const textBlocks = content.blocks
    .map((b) => {
      if ("p" in b) return b.p;
      if ("list" in b) return b.list.map((li) => `- ${li}`).join("\n");
      return `${b.button.label}: ${b.button.url}`;
    })
    .join("\n\n");
  const text = `${textBlocks}\n\n---\n${footerLines.join("\n")}\nUnsubscribe: ${unsub}\n`;

  return { subject: content.subject, html, text };
}

/** When the next follow-up is due, or null once the series is done. */
export function nextEmailAt(createdAt: Date, stepsSent: number): Date | null {
  const next = SEQUENCE[stepsSent];
  return next ? new Date(createdAt.getTime() + next.day * 24 * 60 * 60 * 1000) : null;
}
