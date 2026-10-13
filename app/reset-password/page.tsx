"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ChamberLogo from "@/components/ChamberLogo";

// Reached from the reset email: /api/auth/callback signs the user in with the
// recovery code, then sends them here to choose a new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  };

  const input =
    "w-full bg-chamber-surface border border-chamber-border rounded-lg px-4 py-3 text-white focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim";

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
          <p className="text-[0.75rem] tracking-[3px] text-chamber-text-dim mt-2 uppercase">Choose a new password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-chamber-text-muted mb-1.5">New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required placeholder="At least 6 characters" className={input} />
          </div>
          <div>
            <label className="block text-sm text-chamber-text-muted mb-1.5">Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required placeholder="Type it again" className={input} />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-lg bg-chamber-orange text-black font-bold tracking-wider text-base hover:bg-chamber-orange-hover transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
