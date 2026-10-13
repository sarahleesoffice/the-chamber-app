import Link from "next/link";
import { redirect } from "next/navigation";
import ChamberLogo from "@/components/ChamberLogo";
import SignOutLink from "@/components/SignOutLink";
import { createClient } from "@/lib/supabase/server";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const CHECKOUT_URL = process.env.NEXT_PUBLIC_WHOP_CHECKOUT_URL || "https://whop.com/the-chamber-895d/the-chamber";

const ERRORS: Record<string, string> = {
  denied: "Whop sign-in was cancelled.",
  state: "That sign-in link expired. Try connecting again.",
  taken: "That Whop account is already connected to a different Chamber login.",
  config: "Whop sign-in isn't set up yet. Message SJ and she'll get you in.",
  failed: "Couldn't reach Whop. Try again in a minute.",
};

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getAccess(user);
  const { error, connected } = await searchParams;
  if (access.allowed && access.reason !== "open") redirect("/dashboard");

  const status = access.whopStatus;
  const lapsed = access.whopLinked && !access.allowed;

  return (
    <div className="min-h-screen flex items-center justify-center bg-chamber-bg px-4">
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
          <p className="text-[0.75rem] tracking-[3px] text-chamber-text-dim mt-2 uppercase">Members only</p>
        </div>

        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 space-y-5">
          {error && ERRORS[error] && <p className="text-sm text-red-400">{ERRORS[error]}</p>}
          {connected && !access.allowed && (
            <p className="text-sm text-chamber-text-muted">
              Your Whop account is connected, but there&apos;s no active Chamber membership on it yet.
            </p>
          )}
          {lapsed && status && (
            <p className="text-sm" style={{ color: "#c98500" }}>
              {status === "past_due"
                ? "Your last payment didn't go through. Update your card on Whop to get back in."
                : `Your membership is ${status.replace("_", " ")}. Rejoin on Whop to get back in.`}
            </p>
          )}

          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-chamber-text">Join The Chamber</h2>
            <ul className="text-sm text-chamber-text-muted space-y-1">
              <li>• AI mentors Ember, Amber &amp; Ash</li>
              <li>• Trade journal, performance analytics &amp; Edge Report</li>
              <li>• SMC learning hub &amp; the private Discord</li>
            </ul>
            <p className="text-xs text-chamber-text-dim">$39.99/month or $400/year · 7-day free trial · cancel anytime</p>
          </div>

          <a
            href={CHECKOUT_URL}
            className="block w-full text-center rounded-lg py-3 font-semibold text-white"
            style={{ background: "#e8651a" }}
          >
            {lapsed ? "Rejoin on Whop" : "Start 7-day free trial"}
          </a>

          <div className="border-t border-chamber-border pt-4 space-y-2">
            <p className="text-sm text-chamber-text-muted">
              {access.whopLinked ? "Already joined with a different Whop account?" : "Already a member on Whop?"}
            </p>
            <a
              href="/api/whop/connect"
              className="block w-full text-center rounded-lg py-2.5 text-sm font-semibold border border-chamber-border-light text-chamber-text hover:border-chamber-orange transition-colors"
            >
              {access.whopLinked ? "Reconnect Whop" : "Connect your Whop account"}
            </a>
          </div>

          {access.allowed && (
            <Link href="/dashboard" className="block text-center text-xs text-chamber-text-muted hover:text-chamber-orange">
              Continue to the app →
            </Link>
          )}
        </div>

        <p className="text-center text-xs text-chamber-text-dim mt-6">
          Signed in as {user.email}.{" "}
          <SignOutLink>Not you?</SignOutLink>
        </p>
      </div>
    </div>
  );
}
