import type { Metadata } from "next";
import ChamberLogo from "@/components/ChamberLogo";
import { cleanSource } from "@/lib/free-lessons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free SMC Lessons | The Chamber",
  description: "The full Smart Money Concepts curriculum in The Chamber Discord. Free, forever.",
};

// Public opt-in: email → free Discord lessons + a short email series.
// ?src=ig|tiktok|clip tags where the signup came from.
export default async function FreeLessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; error?: string }>;
}) {
  const { src, error } = await searchParams;
  const source = cleanSource(src);

  return (
    <div className="min-h-screen flex items-center justify-center bg-chamber-bg px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <ChamberLogo size={48} />
          </div>
          <h1
            className="text-3xl font-bold tracking-[5px] text-chamber-orange"
            style={{ textShadow: "0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15)" }}
          >
            THE CHAMBER
          </h1>
          <p className="text-[0.75rem] tracking-[3px] text-chamber-text-dim mt-2 uppercase">Smart Money Concepts</p>
        </div>

        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 space-y-5">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-chamber-text">Get the free SMC lessons</h2>
            <p className="text-sm text-chamber-text-muted">
              The full Smart Money curriculum, inside The Chamber Discord. Free, and it stays free.
            </p>
          </div>

          <ul className="text-sm text-chamber-text-muted space-y-1.5">
            <li>• The basics → intermediate → full models, in order</li>
            <li>• Abbreviations explained, so the jargon stops losing you</li>
            <li>• Market news + the war room, with traders who trade calm</li>
          </ul>

          <form method="POST" action="/api/free/signup" className="space-y-3">
            <input type="hidden" name="src" value={source} />
            {/* Honeypot: hidden from people, filled by bots. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="Your email"
              className="w-full rounded-lg bg-chamber-bg border border-chamber-border-light px-4 py-3 text-chamber-text placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange"
            />
            {error === "email" && <p className="text-xs text-red-400">That email doesn&apos;t look right. Try again.</p>}
            <button
              type="submit"
              className="w-full py-3.5 rounded-lg bg-chamber-orange text-black font-bold tracking-wider text-base hover:bg-chamber-orange-hover transition-colors cursor-pointer"
            >
              Send me the free lessons
            </button>
            <p className="text-xs text-chamber-text-dim">
              You&apos;ll get the Discord invite right away, plus a few short emails from SJ. Unsubscribe anytime.
            </p>
          </form>
        </div>

        <p className="text-center text-[0.7rem] text-chamber-text-dim mt-6 leading-relaxed">
          Education only, not financial advice. Trading involves risk and most traders lose money.
        </p>
      </div>
    </div>
  );
}
