import ChamberLogo from "@/components/ChamberLogo";
import { cleanSource, inviteFor } from "@/lib/free-lessons";

export const dynamic = "force-dynamic";

export default async function FreeThanksPage({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const { src } = await searchParams;
  const invite = inviteFor(cleanSource(src));

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
        </div>

        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 space-y-5 text-center">
          <h2 className="text-2xl font-bold text-chamber-text">You&apos;re in.</h2>
          <p className="text-sm text-chamber-text-muted">
            Join the Discord now and open the <span className="text-chamber-text">STUDY</span> section. Start with
            #the-basics.
          </p>
          <a
            href={invite}
            className="block w-full py-3.5 rounded-lg bg-chamber-orange text-black font-bold tracking-wider text-base hover:bg-chamber-orange-hover transition-colors"
          >
            Join the free Discord
          </a>
          <p className="text-xs text-chamber-text-dim">
            The invite is in your inbox too. Don&apos;t see it? Check spam or promotions.
          </p>
        </div>
      </div>
    </div>
  );
}
