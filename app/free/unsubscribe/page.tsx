import ChamberLogo from "@/components/ChamberLogo";

export const dynamic = "force-dynamic";

// Footer link target. The button POSTs to /api/free/unsubscribe, so email
// scanners that open links can't unsubscribe anyone.
export default async function FreeUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; done?: string }>;
}) {
  const { t = "", done } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-chamber-bg px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <ChamberLogo size={40} />
        </div>
        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 space-y-4 text-center">
          {done ? (
            <>
              <h2 className="text-lg font-semibold text-chamber-text">You&apos;re unsubscribed</h2>
              <p className="text-sm text-chamber-text-muted">
                No more emails. The free lessons in the Discord are still yours.
              </p>
            </>
          ) : (
            <form method="POST" action="/api/free/unsubscribe" className="space-y-4">
              <h2 className="text-lg font-semibold text-chamber-text">Stop the emails?</h2>
              <p className="text-sm text-chamber-text-muted">You&apos;ll keep access to the free lessons in the Discord.</p>
              <input type="hidden" name="t" value={t} />
              <button
                type="submit"
                disabled={!t}
                className="w-full py-3 rounded-lg border border-chamber-border-light text-chamber-text font-semibold hover:border-chamber-orange transition-colors disabled:opacity-50 cursor-pointer"
              >
                Unsubscribe
              </button>
              {!t && <p className="text-xs text-red-400">This link is incomplete. Use the link in your latest email.</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
