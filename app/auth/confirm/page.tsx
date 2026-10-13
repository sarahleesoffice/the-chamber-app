import ChamberLogo from "@/components/ChamberLogo";

export const dynamic = "force-dynamic";

const COPY: Record<string, { title: string; body: string; button: string }> = {
  recovery: {
    title: "Reset your password",
    body: "Tap continue to choose a new password for your Chamber account.",
    button: "Continue",
  },
  default: {
    title: "Confirm your email",
    body: "Tap continue to confirm your email and finish setting up your Chamber account.",
    button: "Confirm my email",
  },
};

// Landing page for email links. Nothing is verified on load — the button
// POSTs to /api/auth/confirm — so link scanners can't use up the token.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash = "", type = "", next = "" } = await searchParams;
  const copy = COPY[type] || COPY.default;

  return (
    <div className="min-h-screen flex items-center justify-center bg-chamber-bg">
      <div className="w-full max-w-md px-8">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-3">
            <ChamberLogo size={48} />
          </div>
          <h1
            className="text-4xl font-bold tracking-[5px] text-chamber-orange"
            style={{ textShadow: "0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15)" }}
          >
            THE CHAMBER
          </h1>
        </div>

        <form method="POST" action="/api/auth/confirm" className="bg-chamber-surface border border-chamber-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-chamber-text">{copy.title}</h2>
          <p className="text-sm text-chamber-text-muted">{copy.body}</p>
          <input type="hidden" name="token_hash" value={token_hash} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            disabled={!token_hash}
            className="w-full py-3.5 rounded-lg bg-chamber-orange text-black font-bold tracking-wider text-base hover:bg-chamber-orange-hover transition-colors disabled:opacity-50 cursor-pointer"
          >
            {copy.button}
          </button>
          {!token_hash && <p className="text-xs text-red-400">This link is incomplete. Request a new one.</p>}
        </form>
      </div>
    </div>
  );
}
