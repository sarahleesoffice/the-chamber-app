"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculatePnlPips, formatPair, COMMON_PAIRS } from "@/lib/trade-math";
import { format } from "date-fns";

export default function EnterTradePage() {
  const supabase = createClient();
  const [pair, setPair] = useState("");
  const [customPair, setCustomPair] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [pnlDollar, setPnlDollar] = useState("");
  const [tradeDate, setTradeDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reasoning, setReasoning] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const activePair = customPair || pair;
  const entry = parseFloat(entryPrice);
  const exit = parseFloat(exitPrice);
  const pips = activePair && !isNaN(entry) && !isNaN(exit)
    ? calculatePnlPips(activePair, direction, entry, exit)
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!activePair) { setError("Select or enter a pair."); return; }
    if (isNaN(entry) || isNaN(exit)) { setError("Enter valid prices."); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Not logged in."); setSaving(false); return; }

    const pnlPips = calculatePnlPips(activePair, direction, entry, exit);
    const dollarVal = pnlDollar ? parseFloat(pnlDollar) : null;

    const { error: dbError } = await supabase.from("trades").insert({
      user_id: user.id,
      pair: formatPair(activePair),
      direction,
      entry_price: entry,
      exit_price: exit,
      pnl_pips: pnlPips,
      pnl_dollar: dollarVal,
      trade_date: tradeDate,
      reasoning,
    });

    setSaving(false);
    if (dbError) {
      setError(dbError.message);
    } else {
      setSuccess(true);
      // Reset form
      setPair("");
      setCustomPair("");
      setEntryPrice("");
      setExitPrice("");
      setPnlDollar("");
      setReasoning("");
    }
  };

  return (
    <div className="space-y-6">
      <h1
        className="text-3xl font-bold tracking-[3px] text-chamber-orange"
        style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
      >
        ENTER TRADE
      </h1>
      <p className="text-chamber-text-muted text-sm">Log a new trade to The Chamber.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Pair */}
        <div>
          <label className="block text-sm text-chamber-text-muted mb-1.5">Pair</label>
          <select
            value={pair}
            onChange={(e) => { setPair(e.target.value); setCustomPair(""); }}
            className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors"
          >
            <option value="">Select pair...</option>
            {COMMON_PAIRS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Or type a custom pair..."
            value={customPair}
            onChange={(e) => { setCustomPair(e.target.value); setPair(""); }}
            className="w-full mt-2 bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
          />
        </div>

        {/* Direction */}
        <div>
          <label className="block text-sm text-chamber-text-muted mb-1.5">Direction</label>
          <div className="flex gap-2">
            {(["long", "short"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all border ${
                  direction === d
                    ? d === "long"
                      ? "bg-green-500/15 border-green-500/40 text-green-400"
                      : "bg-red-500/15 border-red-500/40 text-red-400"
                    : "bg-chamber-surface border-chamber-border text-chamber-text-muted hover:border-chamber-orange/30"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {/* Prices */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-chamber-text-muted mb-1.5">Entry Price</label>
            <input
              type="number"
              step="any"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="0.00000"
              className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
            />
          </div>
          <div>
            <label className="block text-sm text-chamber-text-muted mb-1.5">Exit Price</label>
            <input
              type="number"
              step="any"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder="0.00000"
              className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
            />
          </div>
        </div>

        {/* Live P&L preview */}
        {pips !== null && (
          <div className={`text-center py-2 rounded-lg ${pips > 0 ? "bg-green-500/10 text-green-400" : pips < 0 ? "bg-red-500/10 text-red-400" : "bg-gray-500/10 text-gray-400"}`}>
            <span className="text-2xl font-bold">{pips > 0 ? "+" : ""}{pips.toFixed(1)}</span>
            <span className="text-sm ml-1">pips</span>
          </div>
        )}

        {/* P&L Dollar (optional) */}
        <div>
          <label className="block text-sm text-chamber-text-muted mb-1.5">P&L Dollar (optional)</label>
          <input
            type="number"
            step="any"
            value={pnlDollar}
            onChange={(e) => setPnlDollar(e.target.value)}
            placeholder="0.00"
            className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm text-chamber-text-muted mb-1.5">Trade Date</label>
          <input
            type="date"
            value={tradeDate}
            onChange={(e) => setTradeDate(e.target.value)}
            className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors"
          />
        </div>

        {/* Reasoning */}
        <div>
          <label className="block text-sm text-chamber-text-muted mb-1.5">Reasoning (ICT Analysis)</label>
          <textarea
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            rows={4}
            placeholder="What ICT concepts did you see? OB, FVG, liquidity sweep, kill zone timing..."
            className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim resize-none"
          />
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm">
            Trade saved successfully!
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-lg bg-chamber-orange text-black font-bold text-sm tracking-wider hover:bg-chamber-orange-hover transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Trade"}
        </button>
      </form>

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-[#333] text-[0.65rem] tracking-wider">BASED ON ICT CONCEPTS</p>
        <p className="text-[#292929] text-[0.58rem] mt-1">THIS IS NOT FINANCIAL ADVICE</p>
      </div>
    </div>
  );
}
