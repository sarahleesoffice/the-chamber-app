"use client";

import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";

interface LifetimeRow { email: string; note: string; granted_by: string | null; created_at: string }
interface WhopRow {
  whop_user_id: string;
  has_access: boolean;
  status: string | null;
  current_period_end: string | null;
  email: string | null;
  username: string | null;
  checked_at: string;
  linked: boolean;
}
interface Data { enforced: boolean; lifetime: LifetimeRow[]; whop: WhopRow[] }

const ACCENT = "#e8651a";
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function MembersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [emails, setEmails] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/members").then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (cancelled) return;
      if (!r.ok) {
        setError(r.status === 404 ? "This page is only available to admins." : d.error || "Couldn't load members.");
        return;
      }
      setError("");
      setData(d);
    });
    return () => { cancelled = true; };
  }, [version]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const r = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails, note }),
    });
    const d = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setMessage(d.error || "Couldn't add."); return; }
    setMessage(`Added ${d.added.length} ${d.added.length === 1 ? "email" : "emails"}.`);
    setEmails("");
    setNote("");
    load();
  }

  async function remove(email: string) {
    if (!confirm(`Remove lifetime access for ${email}?`)) return;
    await fetch(`/api/admin/members?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    load();
  }

  const activeWhop = data?.whop.filter((m) => m.has_access) ?? [];
  const trialing = activeWhop.filter((m) => m.status === "trialing").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[2px]" style={{ color: ACCENT, textShadow: "0 0 20px rgba(232,101,26,0.4)" }}>MEMBERS</h1>
        <p className="text-chamber-text-dim text-xs mt-1">
          Who can get into the app: free-for-life friends (by email) and paying members linked through Whop.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data && !error && <p className="text-sm text-chamber-text-muted">Loading members…</p>}

      {data && (
        <>
          <div
            className="rounded-lg border px-4 py-3 text-sm"
            style={{ borderColor: data.enforced ? "#22c55e55" : "#c9850066", background: data.enforced ? "#22c55e10" : "#c9850010" }}
          >
            {data.enforced ? (
              <span className="text-chamber-green">Paywall is ON — only the people below (and admins) can use the app.</span>
            ) : (
              <span style={{ color: "#c98500" }}>
                Paywall is OFF — every logged-in account can still use the app. Add your lifetime friends first, then set
                <code className="mx-1 text-chamber-text">PAYWALL_ENFORCED=true</code>on Vercel.
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Lifetime" value={String(data.lifetime.length)} subText="free for life" />
            <StatCard label="Whop members" value={String(activeWhop.length)} subText="active + trialing" />
            <StatCard label="On trial" value={String(trialing)} />
            <StatCard label="Past / inactive" value={String((data.whop.length || 0) - activeWhop.length)} />
          </div>

          <form onSubmit={add} className="bg-chamber-surface border border-chamber-border rounded-lg p-4 space-y-3">
            <div className="text-sm font-semibold text-chamber-text">Give lifetime access</div>
            <p className="text-xs text-chamber-text-dim">
              Paste one or more emails (commas or new lines). Use the email they log into the Chamber app with — it
              must be a confirmed address.
            </p>
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={3}
              placeholder="friend@example.com, another@example.com"
              className="w-full bg-chamber-bg border border-chamber-border rounded-lg px-3 py-2 text-sm text-white focus:border-chamber-orange focus:outline-none placeholder:text-chamber-text-dim"
            />
            <div className="flex flex-wrap gap-2 items-center">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional) — e.g. day-one friend"
                className="flex-1 min-w-[200px] bg-chamber-bg border border-chamber-border rounded-lg px-3 py-2 text-sm text-white focus:border-chamber-orange focus:outline-none placeholder:text-chamber-text-dim"
              />
              <button
                type="submit"
                disabled={saving || !emails.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 cursor-pointer"
                style={{ background: ACCENT }}
              >
                {saving ? "Adding…" : "Add"}
              </button>
            </div>
            {message && <p className="text-xs text-chamber-text-muted">{message}</p>}
          </form>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-chamber-text-muted">Lifetime ({data.lifetime.length})</h2>
            {data.lifetime.length === 0 ? (
              <p className="text-sm text-chamber-text-dim">No one yet.</p>
            ) : (
              <div className="bg-chamber-surface border border-chamber-border rounded-lg divide-y divide-chamber-border">
                {data.lifetime.map((l) => (
                  <div key={l.email} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-chamber-text truncate">{l.email}</div>
                      <div className="text-[0.7rem] text-chamber-text-dim truncate">
                        {l.note ? `${l.note} · ` : ""}added {day(l.created_at)}
                      </div>
                    </div>
                    <button onClick={() => remove(l.email)} className="text-xs text-chamber-text-muted hover:text-red-400 cursor-pointer">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-widest text-chamber-text-muted">Whop ({data.whop.length})</h2>
            {data.whop.length === 0 ? (
              <p className="text-sm text-chamber-text-dim">No Whop members recorded yet. They appear here when someone joins on Whop or connects their account.</p>
            ) : (
              <div className="bg-chamber-surface border border-chamber-border rounded-lg divide-y divide-chamber-border">
                {data.whop.map((m) => (
                  <div key={m.whop_user_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-chamber-text truncate">{m.email || (m.username ? `@${m.username}` : m.whop_user_id)}</div>
                      <div className="text-[0.7rem] text-chamber-text-dim">
                        {m.linked ? "connected to the app" : "not connected to the app yet"}
                        {m.current_period_end ? ` · period ends ${day(m.current_period_end)}` : ""}
                      </div>
                    </div>
                    <span
                      className="text-[0.65rem] uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ color: m.has_access ? "#22c55e" : "#888", background: m.has_access ? "#22c55e15" : "#2a2a2a" }}
                    >
                      {m.status || (m.has_access ? "active" : "no access")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
