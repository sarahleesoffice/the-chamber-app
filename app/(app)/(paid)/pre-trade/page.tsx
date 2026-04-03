"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

// ── Default checklist items ────────────────────────────────
const DEFAULT_PREP = [
  "Reviewed higher timeframe bias (Daily/4H)",
  "Identified key levels (liquidity pools, OBs, FVGs)",
  "Marked kill zone times",
  "Checked economic calendar",
  "Determined session narrative (Power of 3)",
  "Set max loss for the day",
];

const DEFAULT_ROUTINE = [
  "Working out",
  "Writing in journal",
  "Drank coffee",
];

const DEFAULT_RULES = [
  "Only trade during kill zones",
  "Wait for displacement — no chasing",
  "Minimum 2:1 risk-reward ratio",
  "Stop loss behind structure (OB, liquidity level)",
  "No revenge trades — walk away after 2 consecutive losses",
  "Follow the plan above — no improvisations",
];

// ── Readiness helpers ──────────────────────────────────────
function assessReadiness(scores: Record<string, number>): {
  score: number;
  label: string;
  reasoning: string;
} {
  const { sleep, energy, focus, mood, stress, confidence } = scores;
  const avg =
    (sleep + energy + focus + mood + (10 - stress) + confidence) / 6;
  const score = Math.round(avg * 10) / 10;

  let label: string;
  let reasoning: string;

  if (score >= 7) {
    label = "Green Light";
    reasoning =
      "Your mental state is strong. You are well-rested, focused, and emotionally balanced. Proceed with your plan.";
  } else if (score >= 4) {
    label = "Proceed with Caution";
    reasoning =
      "Some areas need attention. Reduce position size or consider sitting out if stress or focus is low.";
  } else {
    label = "Do Not Trade";
    reasoning =
      "Your readiness is too low. Trading in this state leads to impulsive decisions. Take the day off.";
  }
  return { score, label, reasoning };
}

// ── Section header component ──────────────────────────────
function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mt-7 mb-4">
      <span className="text-chamber-orange-dim text-[0.7rem] font-semibold tracking-wide bg-chamber-orange/10 px-2.5 py-0.5 rounded-lg">
        {number}
      </span>
      <span className="text-[#c0c0c0] text-[0.95rem] font-medium tracking-wide">
        {title}
      </span>
    </div>
  );
}

// ── Checklist section component ───────────────────────────
function ChecklistSection({
  items,
  checked,
  onToggle,
  onDelete,
  onAdd,
  onReset,
  addPlaceholder,
}: {
  items: string[];
  checked: Record<number, boolean>;
  onToggle: (i: number) => void;
  onDelete: (i: number) => void;
  onAdd: (val: string) => void;
  onReset: () => void;
  addPlaceholder: string;
}) {
  const [newItem, setNewItem] = useState("");

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={`${i}-${item}`} className="flex items-center gap-3 group">
          <label className="flex items-center gap-3 flex-1 cursor-pointer">
            <input
              type="checkbox"
              checked={!!checked[i]}
              onChange={() => onToggle(i)}
              className="w-4 h-4 rounded border-chamber-border bg-chamber-surface accent-chamber-orange"
            />
            <span
              className={`text-sm transition-colors ${
                checked[i]
                  ? "text-chamber-text-dim line-through"
                  : "text-chamber-text"
              }`}
            >
              {item}
            </span>
          </label>
          <button
            onClick={() => onDelete(i)}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs text-chamber-text-dim hover:text-chamber-orange transition-all"
            title={`Remove "${item}"`}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Add + Reset row */}
      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newItem.trim()) {
              onAdd(newItem.trim());
              setNewItem("");
            }
          }}
          placeholder={addPlaceholder}
          className="flex-1 bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-sm text-chamber-text placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange/50"
        />
        <button
          onClick={() => {
            if (newItem.trim()) {
              onAdd(newItem.trim());
              setNewItem("");
            }
          }}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-chamber-orange/10 text-chamber-orange hover:bg-chamber-orange/20 transition-colors"
        >
          Add
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-chamber-surface border border-chamber-border text-chamber-text-muted hover:text-chamber-text hover:border-chamber-border-light transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PRE-TRADE CHECKLIST PAGE
// ============================================================
export default function PreTradePage() {
  const supabase = createClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Journal readiness
  const [readiness, setReadiness] = useState<{
    score: number;
    label: string;
    reasoning: string;
  } | null>(null);
  const [journalLoaded, setJournalLoaded] = useState(false);

  // Checklist items
  const [prepItems, setPrepItems] = useState<string[]>(DEFAULT_PREP);
  const [prepChecked, setPrepChecked] = useState<Record<number, boolean>>({});

  const [routineItems, setRoutineItems] = useState<string[]>(DEFAULT_ROUTINE);
  const [routineChecked, setRoutineChecked] = useState<Record<number, boolean>>({});

  const [ruleItems, setRuleItems] = useState<string[]>(DEFAULT_RULES);
  const [rulesChecked, setRulesChecked] = useState<Record<number, boolean>>({});

  // Trade plan
  const [bias, setBias] = useState<"Bullish" | "Bearish" | "Neutral">("Neutral");
  const [pairs, setPairs] = useState("");
  const [riskPerTrade, setRiskPerTrade] = useState("");

  // Load today's journal for readiness
  useEffect(() => {
    async function loadJournal() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setJournalLoaded(true);
        return;
      }

      const { data } = await supabase
        .from("journal_entries")
        .select("sleep, energy, focus, mood, stress, confidence")
        .eq("user_id", user.id)
        .eq("journal_date", todayStr)
        .maybeSingle();

      if (data) {
        const result = assessReadiness(data);
        setReadiness(result);
      }
      setJournalLoaded(true);
    }
    loadJournal();
  }, [todayStr]);

  // ── Computed values ─────────────────────────────────────
  const prepComplete = Object.values(prepChecked).filter(Boolean).length;
  const routineComplete = Object.values(routineChecked).filter(Boolean).length;
  const rulesComplete = Object.values(rulesChecked).filter(Boolean).length;

  const allPrep = prepComplete === prepItems.length;
  const allRules = rulesComplete === ruleItems.length;
  const hasReadiness = readiness !== null && readiness.score >= 4;
  const hasPlan = bias !== "Neutral" && pairs.trim().length > 0;

  // GO / NO-GO status
  let goStatus: "go" | "caution" | "nogo" = "nogo";
  if (allPrep && allRules && hasReadiness && hasPlan) {
    goStatus = "go";
  } else if (hasReadiness && (allPrep || allRules)) {
    goStatus = "caution";
  }

  // Progress
  const totalChecks = prepItems.length + routineItems.length + ruleItems.length;
  const totalComplete = prepComplete + routineComplete + rulesComplete;
  const progressPct = totalChecks > 0 ? (totalComplete / totalChecks) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Header */}
      <h1
        className="text-3xl font-bold tracking-[3px] text-chamber-orange"
        style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
      >
        PRE-TRADE CHECKLIST
      </h1>
      <p className="text-chamber-text-dim text-sm mb-4">
        Complete this before every trading session. No trade without a green
        light.
      </p>

      {/* ─── 01 MENTAL READINESS ──────────────────────────── */}
      <SectionHeader number="01" title="MENTAL READINESS" />

      {!journalLoaded ? (
        <div className="text-chamber-text-dim text-sm py-4">
          Loading readiness...
        </div>
      ) : readiness ? (
        <div
          className="rounded-lg px-4 py-3.5"
          style={{
            borderLeft: `3px solid ${
              readiness.score >= 7
                ? "#22c55e"
                : readiness.score >= 4
                ? "#e8651a"
                : "#ef4444"
            }`,
            background:
              readiness.score >= 7
                ? "rgba(34,197,94,0.08)"
                : readiness.score >= 4
                ? "rgba(232,101,26,0.08)"
                : "rgba(239,68,68,0.08)",
          }}
        >
          <div
            className="font-semibold text-[0.95rem] mb-1"
            style={{
              color:
                readiness.score >= 7
                  ? "#22c55e"
                  : readiness.score >= 4
                  ? "#e8651a"
                  : "#ef4444",
            }}
          >
            Readiness: {readiness.score}/10 &mdash; {readiness.label}
          </div>
          <div className="text-chamber-text-muted text-[0.8rem]">
            {readiness.reasoning}
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg px-4 py-3.5"
          style={{
            borderLeft: "3px solid #e8651a",
            background: "rgba(232,101,26,0.06)",
          }}
        >
          <span className="text-chamber-orange text-[0.85rem]">
            Fill out today&apos;s{" "}
            <strong>Daily Journal</strong> first to get your readiness score.
          </span>
        </div>
      )}

      <div className="border-t border-chamber-border my-5" />

      {/* ─── 02 SESSION PREP ──────────────────────────────── */}
      <SectionHeader number="02" title="SESSION PREP" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-chamber-text-muted text-[0.78rem] uppercase tracking-wider mb-3">
            Session Checklist
          </div>
          <ChecklistSection
            items={prepItems}
            checked={prepChecked}
            onToggle={(i) =>
              setPrepChecked((prev) => ({ ...prev, [i]: !prev[i] }))
            }
            onDelete={(i) => {
              setPrepItems((prev) => prev.filter((_, idx) => idx !== i));
              setPrepChecked((prev) => {
                const next: Record<number, boolean> = {};
                Object.entries(prev).forEach(([k, v]) => {
                  const idx = Number(k);
                  if (idx < i) next[idx] = v;
                  else if (idx > i) next[idx - 1] = v;
                });
                return next;
              });
            }}
            onAdd={(val) => setPrepItems((prev) => [...prev, val])}
            onReset={() => {
              setPrepItems([...DEFAULT_PREP]);
              setPrepChecked({});
            }}
            addPlaceholder="e.g. Review previous session notes..."
          />
        </div>

        <div>
          <div className="text-chamber-text-muted text-[0.78rem] uppercase tracking-wider mb-3">
            Prep Progress
          </div>
          <div className="bg-chamber-surface border border-chamber-border rounded-lg p-4 space-y-3">
            <div className="w-full h-2 bg-chamber-border rounded-full overflow-hidden">
              <div
                className="h-full bg-chamber-orange rounded-full transition-all duration-300"
                style={{
                  width: `${
                    prepItems.length > 0
                      ? (prepComplete / prepItems.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <p className="text-chamber-text-dim text-xs">
              {prepComplete}/{prepItems.length} prep items complete
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-chamber-border my-5" />

      {/* ─── 03 TRADE PLAN ────────────────────────────────── */}
      <SectionHeader number="03" title="TRADE PLAN" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-chamber-text-muted text-[0.78rem] uppercase tracking-wider mb-3">
            Bias
          </div>
          <div className="flex gap-2">
            {(["Bullish", "Bearish", "Neutral"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBias(b)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  bias === b
                    ? b === "Bullish"
                      ? "bg-chamber-green/15 text-chamber-green border border-chamber-green/30"
                      : b === "Bearish"
                      ? "bg-chamber-red/15 text-chamber-red border border-chamber-red/30"
                      : "bg-chamber-surface border border-chamber-border text-chamber-text-muted"
                    : "bg-chamber-surface border border-chamber-border text-chamber-text-dim hover:text-chamber-text hover:border-chamber-border-light"
                }`}
              >
                {b === "Neutral" ? "Neutral / No Trade" : b}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-chamber-text-muted text-[0.78rem] uppercase tracking-wider mb-2">
              Target Asset
            </div>
            <input
              type="text"
              value={pairs}
              onChange={(e) => setPairs(e.target.value)}
              placeholder="NAS100, EUR/USD, GBP/USD"
              className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-sm text-chamber-text placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange/50"
            />
          </div>
          <div>
            <div className="text-chamber-text-muted text-[0.78rem] uppercase tracking-wider mb-2">
              Risk Per Trade
            </div>
            <input
              type="text"
              value={riskPerTrade}
              onChange={(e) => setRiskPerTrade(e.target.value)}
              placeholder="e.g. 1% or 20 pips"
              className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-sm text-chamber-text placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange/50"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-chamber-border my-5" />

      {/* ─── 04 PRE-CHECKLIST RULES ───────────────────────── */}
      <SectionHeader number="04" title="PRE-CHECKLIST RULES" />

      <ChecklistSection
        items={routineItems}
        checked={routineChecked}
        onToggle={(i) =>
          setRoutineChecked((prev) => ({ ...prev, [i]: !prev[i] }))
        }
        onDelete={(i) => {
          setRoutineItems((prev) => prev.filter((_, idx) => idx !== i));
          setRoutineChecked((prev) => {
            const next: Record<number, boolean> = {};
            Object.entries(prev).forEach(([k, v]) => {
              const idx = Number(k);
              if (idx < i) next[idx] = v;
              else if (idx > i) next[idx - 1] = v;
            });
            return next;
          });
        }}
        onAdd={(val) => setRoutineItems((prev) => [...prev, val])}
        onReset={() => {
          setRoutineItems([...DEFAULT_ROUTINE]);
          setRoutineChecked({});
        }}
        addPlaceholder="e.g. Meditated, Reviewed notes..."
      />

      <div className="border-t border-chamber-border my-5" />

      {/* ─── 05 RULES ─────────────────────────────────────── */}
      <SectionHeader number="05" title="RULES" />

      <ChecklistSection
        items={ruleItems}
        checked={rulesChecked}
        onToggle={(i) =>
          setRulesChecked((prev) => ({ ...prev, [i]: !prev[i] }))
        }
        onDelete={(i) => {
          setRuleItems((prev) => prev.filter((_, idx) => idx !== i));
          setRulesChecked((prev) => {
            const next: Record<number, boolean> = {};
            Object.entries(prev).forEach(([k, v]) => {
              const idx = Number(k);
              if (idx < i) next[idx] = v;
              else if (idx > i) next[idx - 1] = v;
            });
            return next;
          });
        }}
        onAdd={(val) => setRuleItems((prev) => [...prev, val])}
        onReset={() => {
          setRuleItems([...DEFAULT_RULES]);
          setRulesChecked({});
        }}
        addPlaceholder="e.g. No trading on Fridays..."
      />

      <div className="border-t border-chamber-border my-5" />

      {/* ─── OVERALL PROGRESS BAR ─────────────────────────── */}
      <div className="w-full h-2 bg-chamber-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progressPct}%`,
            background:
              progressPct === 100
                ? "#22c55e"
                : progressPct >= 50
                ? "#e8651a"
                : "#ef4444",
          }}
        />
      </div>
      <p className="text-chamber-text-dim text-xs text-center">
        {totalComplete}/{totalChecks} total items complete
      </p>

      {/* ─── GO / NO-GO ───────────────────────────────────── */}
      <div className="mt-4">
        {goStatus === "go" && (
          <div className="text-center py-5 rounded-lg bg-chamber-green/5 border border-chamber-green/30">
            <div className="text-3xl mb-1">&#x2705;</div>
            <div className="text-chamber-green text-xl font-semibold">
              GO &mdash; Ready to Trade
            </div>
            <div className="text-chamber-text-muted text-sm mt-1">
              Stick to the plan. Execute with discipline.
            </div>
          </div>
        )}
        {goStatus === "caution" && (
          <div className="text-center py-5 rounded-lg bg-chamber-orange/5 border border-chamber-orange/30">
            <div className="text-3xl mb-1">&#x26A0;</div>
            <div className="text-chamber-orange text-xl font-semibold">
              CAUTION &mdash; Almost Ready
            </div>
            <div className="text-chamber-text-muted text-sm mt-1">
              Complete all checklist items before trading.
            </div>
          </div>
        )}
        {goStatus === "nogo" && (
          <div className="text-center py-5 rounded-lg bg-chamber-red/5 border border-chamber-red/30">
            <div className="text-3xl mb-1">&#x1F6D1;</div>
            <div className="text-chamber-red text-xl font-semibold">
              NO-GO &mdash; Not Ready
            </div>
            <div className="text-chamber-text-muted text-sm mt-1">
              Complete your prep, journal, and checklist before opening any
              trades.
            </div>
          </div>
        )}
      </div>

      {/* ─── Footer ───────────────────────────────────────── */}
      <div className="text-center mt-8 leading-relaxed">
        <span className="text-[#333] text-[0.65rem] tracking-wide">
          PRE-TRADE CHECKLIST &middot; BASED ON ICT CONCEPTS
        </span>
        <br />
        <span className="text-[#292929] text-[0.58rem]">
          THIS IS NOT FINANCIAL ADVICE
        </span>
      </div>
    </div>
  );
}
