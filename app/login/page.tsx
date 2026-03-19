"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import ChamberLogo from "@/components/ChamberLogo";
import Link from "next/link";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
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
          <p className="text-[0.75rem] tracking-[3px] text-chamber-text-dim mt-2 uppercase">
            Trading Mentor
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
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
          <div>
            <label className="block text-sm text-chamber-text-muted mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
              className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-4 py-3 text-white focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
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
            className="w-full py-3.5 rounded-lg bg-chamber-orange text-black font-bold tracking-wider text-base hover:bg-chamber-orange-hover transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-chamber-text-muted mt-8">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-chamber-orange hover:text-chamber-orange-hover">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
