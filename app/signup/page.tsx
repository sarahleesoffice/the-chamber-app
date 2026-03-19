"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      // Email confirmation disabled — go straight to the app
      window.location.href = "/dashboard";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-chamber-bg">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-bold tracking-[4px] text-chamber-orange"
            style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
          >
            THE CHAMBER
          </h1>
          <p className="text-[0.65rem] tracking-[2px] text-chamber-text-dim mt-1 uppercase">
            Create your account
          </p>
        </div>

        {success ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-6 text-center">
            <p className="text-green-400 font-semibold mb-2">Check your email!</p>
            <p className="text-chamber-text-muted text-sm">
              We sent a confirmation link to <strong className="text-white">{email}</strong>. Click it to activate your account.
            </p>
            <Link href="/login" className="inline-block mt-4 text-chamber-orange hover:text-chamber-orange-hover text-sm">
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-sm text-chamber-text-muted mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
              />
            </div>
            <div>
              <label className="block text-sm text-chamber-text-muted mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
              />
            </div>
            <div>
              <label className="block text-sm text-chamber-text-muted mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-chamber-orange text-black font-bold text-sm tracking-wider hover:bg-chamber-orange-hover transition-colors disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>
          </form>
        )}

        {!success && (
          <p className="text-center text-sm text-chamber-text-muted mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-chamber-orange hover:text-chamber-orange-hover">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
