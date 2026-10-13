"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ChamberLogo from "@/components/ChamberLogo";

export default function ForgotPasswordForm({ expired }: { expired: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    // Same message whether or not the account exists, so emails can't be probed.
    if (error && error.status === 429) {
      setError("Too many requests — wait a minute and try again.");
      return;
    }
    setSent(true);
  };

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
          <p className="text-[0.75rem] tracking-[3px] text-chamber-text-dim mt-2 uppercase">Reset password</p>
        </div>

        {expired && !sent && (
          <div className="mb-5 bg-chamber-surface border border-chamber-border rounded-lg p-3 text-sm text-chamber-text-muted">
            That reset link expired or was already used. Enter your email to get a new one.
          </div>
        )}

        {sent ? (
          <div className="bg-chamber-surface border border-chamber-border rounded-lg p-5 text-sm text-chamber-text-muted space-y-2">
            <p className="text-chamber-text">Check your email.</p>
            <p>
              If there&apos;s an account for <span className="text-chamber-text">{email.trim()}</span>, we sent a link to
              set a new password. It can take a minute — check spam too.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-chamber-text-muted mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-4 py-3 text-white focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-lg bg-chamber-orange text-black font-bold tracking-wider text-base hover:bg-chamber-orange-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-chamber-text-muted mt-8">
          Remembered it?{" "}
          <Link href="/login" className="text-chamber-orange hover:text-chamber-orange-hover">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
