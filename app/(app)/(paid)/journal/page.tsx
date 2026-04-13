"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Trade, JournalEntry } from "@/lib/types";
import { format, addDays, subDays } from "date-fns";

// ============================================================
// Psychology Framework Constants
// Based on Jared Tendler's "The Mental Game of Trading"
// ============================================================

const MENTAL_STATE_CATEGORIES: Record<
  string,
  { label: string; description: string; lowWarning: string; inverted?: boolean }
> = {
  sleep: {
    label: "Sleep Quality",
    description: "How well did you sleep last night?",
    lowWarning:
      "Poor sleep drains willpower and makes discipline breakdowns more likely.",
  },
  energy: {
    label: "Energy Level",
    description: "How is your physical and mental energy?",
    lowWarning:
      "Low energy depletes willpower. Every decision burns energy.",
  },
  focus: {
    label: "Focus",
    description: "How clear and focused is your mind?",
    lowWarning:
      "Lack of focus leads to missed signals and impulsive decisions.",
  },
  mood: {
    label: "Mood",
    description: "How is your overall emotional state?",
    lowWarning:
      "Negative mood can be accumulated tilt or fear from previous sessions.",
  },
  stress: {
    label: "Stress Level",
    description: "How stressed are you? (1 = relaxed, 10 = extremely stressed)",
    lowWarning:
      "High stress outside of trading bleeds into your execution.",
    inverted: true,
  },
  confidence: {
    label: "Confidence",
    description: "How confident do you feel in your trading today?",
    lowWarning:
      "Low confidence signals a skill gap or unresolved fear.",
  },
};

const EMOTIONAL_STATES = [
  "Disciplined", "Confident", "Calm", "Focused", "Patient", "Neutral",
  "Greedy", "Excited", "Euphoric", "Impatient (to profit)",
  "Fearful", "Anxious", "Hesitant", "Doubtful",
  "Frustrated", "Angry", "Revenge-minded", "Tilted",
  "Overconfident", "Insecure", "Desperate",
  "Bored", "Distracted", "Lazy", "Impulsive",
];

const ICT_SETUPS = [
  "Order Block Entry",
  "Fair Value Gap Fill",
  "Liquidity Sweep",
  "OTE (Optimal Trade Entry)",
  "Market Structure Shift",
  "Break of Structure",
  "Silver Bullet",
  "Breaker Block",
  "Mitigation Block",
  "Power of 3 Play",
  "ICT Macro Entry",
  "Propulsion Block",
  "Judas Swing",
  "CE (Consequent Encroachment)",
  "IOFED Setup",
];

const MARKET_CONDITIONS = [
  "Trending (Strong)",
  "Trending (Weak)",
  "Ranging / Consolidation",
  "Choppy / Indecisive",
  "News-Driven / Volatile",
  "Low Volume / Thin",
  "Reversal Day",
  "Expansion Day",
];

const MISTAKES_BY_CATEGORY: Record<string, string[]> = {
  Greed: [
    "Moved profit target further away",
    "Added to a winning position without plan",
    "Oversized position for bigger gains",
    "Held past exit signal hoping for more",
    "Took a trade just because others were profiting",
    "Ignored risk for potential reward",
    "Chased entry after missing ideal level",
    "Focused on P&L instead of process",
  ],
  Fear: [
    "Hesitated on a valid setup",
    "Exited too early (locked in small profit)",
    "Reduced position size out of fear",
    "Moved stop to breakeven too soon",
    "Skipped a trade that fit the plan",
    "Froze and couldn't pull the trigger",
    "Second-guessed analysis mid-trade",
    "Avoided trading after a loss",
  ],
  "Tilt / Anger": [
    "Revenge traded after a loss",
    "Doubled down to make back losses",
    "Ignored stop loss",
    "Traded without thinking (fired off trades)",
    "Fixated on a past mistake during session",
    "Became blind to risk",
    "Broke rules out of frustration",
    "Traded to prove something",
  ],
  Confidence: [
    "Traded a setup outside my skill level",
    "Assumed I couldn't lose",
    "Ignored warning signs (overconfidence)",
    "Gave up too quickly on a valid approach",
    "Compared myself to other traders",
    "Let a losing streak destroy my conviction",
    "Refused to admit a mistake",
    "Took credit for luck",
  ],
  Discipline: [
    "Traded outside kill zone",
    "Traded without a plan",
    "Didn't do pre-market prep",
    "Skipped post-session review",
    "Got distracted during session",
    "Overtraded (too many setups)",
    "Entered before confirmation",
    "Didn't follow position sizing rules",
    "Quit session early after a win",
    "Procrastinated on journaling",
  ],
};

function assessReadiness(scores: Record<string, number>): {
  score: number;
  label: string;
  reasoning: string;
} {
  const keys = Object.keys(scores);
  if (keys.length === 0) {
    return { score: 5, label: "Incomplete", reasoning: "Complete your mental state assessment first." };
  }

  // For inverted metrics (like stress), flip the value so high = bad becomes low in the average
  const effectiveValue = (k: string) => {
    const info = MENTAL_STATE_CATEGORIES[k];
    return info?.inverted ? (11 - scores[k]) : scores[k];
  };

  const avg = keys.reduce((sum, k) => sum + effectiveValue(k), 0) / keys.length;
  const criticalLow = keys.filter((k) => effectiveValue(k) <= 3);

  if (avg >= 8 && criticalLow.length === 0) {
    return {
      score: 9,
      label: "Optimal",
      reasoning: "You're in a strong mental state. Execute your plan with confidence, but stay aware of overconfidence.",
    };
  }
  if (avg >= 6.5 && criticalLow.length === 0) {
    return {
      score: 7,
      label: "Good to trade",
      reasoning: "Solid mental state. Stick to your A+ setups and follow your rules.",
    };
  }
  if (avg >= 5 && criticalLow.length <= 1) {
    let reasoning = "Some areas are compromised. Reduce position size and only take the highest conviction setups.";
    if (criticalLow.length > 0) {
      const cat = criticalLow[0];
      const info = MENTAL_STATE_CATEGORIES[cat];
      if (info) reasoning += ` Watch out: ${info.lowWarning}`;
    }
    return { score: 5, label: "Trade with caution", reasoning };
  }
  if (avg >= 3.5) {
    return {
      score: 3,
      label: "Not recommended",
      reasoning: "Your mental state is significantly compromised. Consider analysis and journaling only.",
    };
  }
  return {
    score: 1,
    label: "Do not trade",
    reasoning: "Step away from the screens. Your willpower and emotional state are depleted. Rest, recover, review.",
  };
}

// ============================================================
// Positive emotions (first 6) get green tint, rest get red/orange
// ============================================================
const POSITIVE_EMOTIONS = new Set(["Disciplined", "Confident", "Calm", "Focused", "Patient", "Neutral"]);

// ============================================================
// Component: Slider
// ============================================================
function Slider({
  label,
  description,
  value,
  onChange,
  inverted,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  inverted?: boolean;
}) {
  const pct = ((value - 1) / 9) * 100;
  const color = inverted
    ? (value <= 3 ? "#22c55e" : value <= 6 ? "#e8651a" : "#ef4444")
    : (value >= 7 ? "#22c55e" : value >= 4 ? "#e8651a" : "#ef4444");

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>
          {value}
        </span>
      </div>
      <p className="text-[0.7rem] text-chamber-text-muted leading-tight">{description}</p>
      <div className="relative">
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #1e1e1e ${pct}%, #1e1e1e 100%)`,
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Component: Toggle Chip (for multiselect buttons)
// ============================================================
function ToggleChip({
  label,
  selected,
  onClick,
  colorClass,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  colorClass?: string;
}) {
  const base = selected
    ? colorClass || "bg-chamber-orange/20 border-chamber-orange text-chamber-orange"
    : "bg-chamber-surface border-chamber-border text-chamber-text-muted hover:border-chamber-text-muted/40 hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-[0.78rem] transition-all ${base}`}
    >
      {label}
    </button>
  );
}

// ============================================================
// Main Page
// ============================================================
export default function DailyJournalPage() {
  const supabase = createClient();

  // Date state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const dateStr = format(currentDate, "yyyy-MM-dd");
  const displayDate = format(currentDate, "EEEE, MMMM d, yyyy");

  // Loading / saving
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // P&L
  const [dayTrades, setDayTrades] = useState<Trade[]>([]);

  // Mental state sliders
  const [mentalScores, setMentalScores] = useState<Record<string, number>>({
    sleep: 5,
    energy: 5,
    focus: 5,
    mood: 5,
    stress: 5,
    confidence: 5,
  });

  // Selections
  const [selectedSetups, setSelectedSetups] = useState<string[]>([]);
  const [customSetup, setCustomSetup] = useState("");
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>([]);
  const [marketCondition, setMarketCondition] = useState(MARKET_CONDITIONS[0]);
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [customMistakeInputs, setCustomMistakeInputs] = useState<Record<string, string>>({});

  // Text areas
  const [reflection, setReflection] = useState("");
  const [lessons, setLessons] = useState("");
  const [improvements, setImprovements] = useState("");

  // Track existing entry id for upsert
  const [existingId, setExistingId] = useState<string | null>(null);

  // ── Load data when date changes ──
  const loadData = useCallback(async () => {
    setLoading(true);
    setSaveMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Fetch trades + journal entry in parallel
    const [tradesRes, journalRes] = await Promise.all([
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .eq("trade_date", dateStr),
      supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("journal_date", dateStr)
        .maybeSingle(),
    ]);

    setDayTrades((tradesRes.data as Trade[]) || []);

    const entry = journalRes.data as JournalEntry | null;
    if (entry) {
      setExistingId(entry.id || null);
      setMentalScores({
        sleep: entry.sleep ?? 5,
        energy: entry.energy ?? 5,
        focus: entry.focus ?? 5,
        mood: entry.mood ?? 5,
        stress: entry.stress ?? 5,
        confidence: entry.confidence ?? 5,
      });
      setSelectedSetups(entry.ict_setups_used || []);
      setCustomSetup("");
      setSelectedEmotions(entry.emotional_states || []);
      setMarketCondition(entry.market_condition || MARKET_CONDITIONS[0]);
      setSelectedMistakes(entry.mistakes || []);
      setReflection(entry.reflection || "");
      setLessons(entry.lessons_learned || "");
      setImprovements(entry.tomorrows_improvements || "");
    } else {
      // Reset to defaults
      setExistingId(null);
      setMentalScores({ sleep: 5, energy: 5, focus: 5, mood: 5, stress: 5, confidence: 5 });
      setSelectedSetups([]);
      setCustomSetup("");
      setSelectedEmotions([]);
      setMarketCondition(MARKET_CONDITIONS[0]);
      setSelectedMistakes([]);
      setReflection("");
      setLessons("");
      setImprovements("");
    }

    setExpandedCategories({});
    setCustomMistakeInputs({});
    setLoading(false);
  }, [dateStr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Readiness ──
  const readiness = useMemo(() => assessReadiness(mentalScores), [mentalScores]);
  const readinessColor =
    readiness.score >= 7 ? "#22c55e" : readiness.score >= 4 ? "#e8651a" : "#ef4444";

  // ── P&L summary ──
  const pnlSummary = useMemo(() => {
    if (!dayTrades.length) return null;
    const totalPips = dayTrades.reduce((s, t) => s + t.pnl_pips, 0);
    const totalDollar = dayTrades.reduce((s, t) => s + (t.pnl_dollar || 0), 0);
    const wins = dayTrades.filter((t) => t.pnl_pips > 0).length;
    const losses = dayTrades.filter((t) => t.pnl_pips < 0).length;
    return { totalPips, totalDollar, wins, losses, count: dayTrades.length };
  }, [dayTrades]);

  // ── Merge setups (selected + custom) ──
  const allSetups = useMemo(() => {
    const customs = customSetup
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = [...selectedSetups];
    for (const c of customs) {
      if (!merged.includes(c)) merged.push(c);
    }
    return merged;
  }, [selectedSetups, customSetup]);

  // ── Toggle helpers ──
  function toggleSetup(setup: string) {
    setSelectedSetups((prev) =>
      prev.includes(setup) ? prev.filter((s) => s !== setup) : [...prev, setup]
    );
  }

  function toggleEmotion(emotion: string) {
    setSelectedEmotions((prev) =>
      prev.includes(emotion) ? prev.filter((e) => e !== emotion) : [...prev, emotion]
    );
  }

  function toggleMistake(mistake: string) {
    setSelectedMistakes((prev) =>
      prev.includes(mistake) ? prev.filter((m) => m !== mistake) : [...prev, mistake]
    );
  }

  function toggleCategory(cat: string) {
    setExpandedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  // ── Save ──
  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaveMessage("Not authenticated.");
      setSaving(false);
      return;
    }

    const payload = {
      user_id: user.id,
      journal_date: dateStr,
      sleep: mentalScores.sleep,
      energy: mentalScores.energy,
      focus: mentalScores.focus,
      mood: mentalScores.mood,
      stress: mentalScores.stress,
      confidence: mentalScores.confidence,
      readiness_score: readiness.score,
      readiness_label: readiness.label,
      emotional_states: selectedEmotions,
      ict_setups_used: allSetups,
      market_condition: marketCondition,
      mistakes: selectedMistakes,
      reflection,
      lessons_learned: lessons,
      tomorrows_improvements: improvements,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existingId) {
      const res = await supabase
        .from("journal_entries")
        .update(payload)
        .eq("id", existingId);
      error = res.error;
    } else {
      const res = await supabase.from("journal_entries").insert(payload).select().single();
      error = res.error;
      if (!error && res.data) {
        setExistingId(res.data.id);
      }
    }

    if (error) {
      setSaveMessage(`Error: ${error.message}`);
    } else {
      setSaveMessage("Journal entry saved!");
    }
    setSaving(false);

    // Auto-clear success message
    if (!error) {
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  // ── Date navigation ──
  function goToDate(d: Date) {
    setCurrentDate(d);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-chamber-text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "linear-gradient(135deg, rgba(232,101,26,0.08) 0%, rgba(10,10,10,0.95) 60%)",
          border: "1px solid rgba(232,101,26,0.15)",
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-2xl font-bold tracking-[3px] text-chamber-orange"
              style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
            >
              DAILY JOURNAL
            </h1>
            <p className="text-chamber-text-muted text-sm mt-1">📝 {displayDate}</p>
          </div>

          {/* Date Nav */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => goToDate(subDays(currentDate, 1))}
              className="w-8 h-8 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange hover:border-chamber-orange/30 transition-colors flex items-center justify-center"
            >
              ‹
            </button>
            <button
              onClick={() => goToDate(new Date())}
              className="px-3 h-8 rounded-lg bg-chamber-orange/15 border border-chamber-orange/40 text-xs text-chamber-orange font-semibold hover:bg-chamber-orange/25 transition-colors"
            >
              Today
            </button>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => {
                if (e.target.value) goToDate(new Date(e.target.value + "T12:00:00"));
              }}
              className="h-8 px-2 rounded-lg bg-chamber-surface border border-chamber-border text-xs text-white [color-scheme:dark] cursor-pointer"
            />
            <button
              onClick={() => goToDate(addDays(currentDate, 1))}
              className="w-8 h-8 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange hover:border-chamber-orange/30 transition-colors flex items-center justify-center"
            >
              ›
            </button>
          </div>
        </div>

        {/* Daily P&L Summary */}
        {pnlSummary ? (
          <div className="flex items-center gap-4 mt-4 pt-3" style={{ borderTop: "1px solid rgba(232,101,26,0.1)" }}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-chamber-text-dim uppercase tracking-wider">P&L</span>
              <span
                className="text-lg font-bold"
                style={{ color: pnlSummary.totalPips > 0 ? "#22c55e" : pnlSummary.totalPips < 0 ? "#ef4444" : "#888" }}
              >
                {pnlSummary.totalPips > 0 ? "+" : ""}{pnlSummary.totalPips.toFixed(1)}p
              </span>
              {pnlSummary.totalDollar !== 0 && (
                <span className="text-xs text-chamber-text-muted">(${pnlSummary.totalDollar.toFixed(2)})</span>
              )}
            </div>
            <span className="text-chamber-border">|</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-chamber-text-dim uppercase tracking-wider">Trades</span>
              <span className="text-sm font-bold text-white">{pnlSummary.count}</span>
            </div>
            <span className="text-chamber-border">|</span>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-green-400">{pnlSummary.wins}W</span>
              <span className="text-chamber-text-dim">/</span>
              <span className="text-sm font-bold text-red-400">{pnlSummary.losses}L</span>
            </div>
          </div>
        ) : (
          <p className="text-chamber-text-dim text-xs mt-3 pt-3" style={{ borderTop: "1px solid rgba(232,101,26,0.1)" }}>
            No trades logged for this date
          </p>
        )}
      </div>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* MENTAL STATE ASSESSMENT                                       */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-4"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          MENTAL STATE ASSESSMENT
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          {Object.entries(MENTAL_STATE_CATEGORIES).map(([key, info]) => (
            <Slider
              key={key}
              label={info.label}
              description={info.description}
              value={mentalScores[key] ?? 5}
              onChange={(v) => setMentalScores((prev) => ({ ...prev, [key]: v }))}
              inverted={info.inverted}
            />
          ))}
        </div>

        {/* Readiness Score */}
        <div
          className="mt-5 p-4 rounded-lg border-l-4"
          style={{
            borderLeftColor: readinessColor,
            background: "#141414",
          }}
        >
          <p className="font-bold" style={{ color: readinessColor }}>
            Trading Readiness: {readiness.score}/10 &mdash; {readiness.label}
          </p>
          <p className="text-chamber-text-muted text-[0.85rem] mt-1">{readiness.reasoning}</p>
        </div>
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* ICT SETUPS USED TODAY                                         */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          ICT SETUPS USED TODAY
        </h2>

        <div className="flex flex-wrap gap-2 mb-3">
          {ICT_SETUPS.map((setup) => (
            <ToggleChip
              key={setup}
              label={setup}
              selected={selectedSetups.includes(setup)}
              onClick={() => toggleSetup(setup)}
            />
          ))}
          {/* Show previously saved custom setups as removable chips */}
          {selectedSetups
            .filter((s) => !ICT_SETUPS.includes(s))
            .map((custom) => (
              <button
                key={custom}
                type="button"
                onClick={() => setSelectedSetups((prev) => prev.filter((s) => s !== custom))}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all border bg-chamber-orange/20 border-chamber-orange/50 text-chamber-orange"
              >
                {custom} ✕
              </button>
            ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={customSetup}
            onChange={(e) => setCustomSetup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customSetup.trim()) {
                e.preventDefault();
                const newSetups = customSetup.split(",").map((s) => s.trim()).filter(Boolean);
                setSelectedSetups((prev) => [...prev, ...newSetups.filter((s) => !prev.includes(s))]);
                setCustomSetup("");
              }
            }}
            placeholder="Type a custom setup and press Enter..."
            className="flex-1 px-3 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-white placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange/50 transition-colors"
          />
          {customSetup.trim() && (
            <button
              type="button"
              onClick={() => {
                const newSetups = customSetup.split(",").map((s) => s.trim()).filter(Boolean);
                setSelectedSetups((prev) => [...prev, ...newSetups.filter((s) => !prev.includes(s))]);
                setCustomSetup("");
              }}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-chamber-orange/20 border border-chamber-orange/40 text-chamber-orange hover:bg-chamber-orange/30 transition-colors"
            >
              + Add
            </button>
          )}
        </div>
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* MARKET & EMOTIONS                                             */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-4"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          MARKET &amp; EMOTIONS
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Market Condition */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Market Condition</h3>
            <div className="flex flex-wrap gap-2">
              {MARKET_CONDITIONS.map((mc) => (
                <button
                  key={mc}
                  type="button"
                  onClick={() => setMarketCondition(mc)}
                  className={`px-3 py-1.5 rounded-full border text-[0.78rem] transition-all ${
                    marketCondition === mc
                      ? "bg-chamber-orange/20 border-chamber-orange text-chamber-orange"
                      : "bg-chamber-surface border-chamber-border text-chamber-text-muted hover:border-chamber-text-muted/40 hover:text-white"
                  }`}
                >
                  {mc}
                </button>
              ))}
            </div>
          </div>

          {/* Emotional State */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Emotional State</h3>
            <div className="flex flex-wrap gap-2">
              {EMOTIONAL_STATES.map((emotion) => {
                const isPositive = POSITIVE_EMOTIONS.has(emotion);
                const isSelected = selectedEmotions.includes(emotion);
                const colorClass = isSelected
                  ? isPositive
                    ? "bg-green-500/15 border-green-500/50 text-green-400"
                    : "bg-red-500/15 border-red-500/50 text-red-400"
                  : "";
                return (
                  <ToggleChip
                    key={emotion}
                    label={emotion}
                    selected={isSelected}
                    onClick={() => toggleEmotion(emotion)}
                    colorClass={colorClass}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* MISTAKES MADE                                                 */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          MISTAKES MADE
        </h2>

        <div className="space-y-2">
          {Object.entries(MISTAKES_BY_CATEGORY).map(([category, mistakes]) => {
            const isExpanded = expandedCategories[category] ?? false;
            const categoryCount = mistakes.filter((m) => selectedMistakes.includes(m)).length +
              selectedMistakes.filter((m) => m.startsWith(`[${category}] `)).length;

            return (
              <div
                key={category}
                className="bg-chamber-surface border border-chamber-border rounded-lg overflow-hidden"
              >
                {/* Category header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="font-semibold text-sm text-white">{category}</span>
                  <div className="flex items-center gap-2">
                    {categoryCount > 0 && (
                      <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400">
                        {categoryCount}
                      </span>
                    )}
                    <span className="text-chamber-text-muted text-sm">
                      {isExpanded ? "\u25B2" : "\u25BC"}
                    </span>
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1.5 border-t border-chamber-border pt-3">
                    {mistakes.map((mistake) => (
                      <label
                        key={mistake}
                        className="flex items-center gap-3 cursor-pointer group py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMistakes.includes(mistake)}
                          onChange={() => toggleMistake(mistake)}
                          className="w-4 h-4 rounded border-chamber-border bg-[#0e0e0e] accent-chamber-orange cursor-pointer"
                        />
                        <span className="text-sm text-chamber-text-muted group-hover:text-white transition-colors">
                          {mistake}
                        </span>
                      </label>
                    ))}
                    {/* Custom mistakes added by user for this category */}
                    {selectedMistakes
                      .filter((m) => !Object.values(MISTAKES_BY_CATEGORY).flat().includes(m) && m.startsWith(`[${category}] `))
                      .map((customMistake) => (
                        <label
                          key={customMistake}
                          className="flex items-center gap-3 cursor-pointer group py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={true}
                            onChange={() => toggleMistake(customMistake)}
                            className="w-4 h-4 rounded border-chamber-border bg-[#0e0e0e] accent-chamber-orange cursor-pointer"
                          />
                          <span className="text-sm text-chamber-orange group-hover:text-white transition-colors italic">
                            {customMistake.replace(`[${category}] `, "")}
                          </span>
                        </label>
                      ))}
                    {/* Custom write-in */}
                    <div className="pt-2 mt-1 border-t border-chamber-border/50">
                      <input
                        type="text"
                        value={customMistakeInputs[category] || ""}
                        onChange={(e) =>
                          setCustomMistakeInputs((prev) => ({ ...prev, [category]: e.target.value }))
                        }
                        placeholder={`Add a custom ${category.toLowerCase()} mistake...`}
                        className="w-full bg-[#0e0e0e] border border-chamber-border rounded-md px-3 py-1.5 text-sm text-white placeholder-chamber-text-dim focus:outline-none focus:border-chamber-orange/50 transition-colors"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = (customMistakeInputs[category] || "").trim();
                            if (val) {
                              const taggedVal = `[${category}] ${val}`;
                              if (!selectedMistakes.includes(taggedVal)) {
                                setSelectedMistakes((prev) => [...prev, taggedVal]);
                              }
                              setCustomMistakeInputs((prev) => ({ ...prev, [category]: "" }));
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* DAILY REFLECTION                                              */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          DAILY REFLECTION
        </h2>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="What happened today? How did you feel about your trading?"
          rows={5}
          className="w-full px-4 py-3 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-white placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange/50 transition-colors resize-y"
        />
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* LESSONS & IMPROVEMENTS                                        */}
      {/* ============================================================ */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          LESSONS &amp; IMPROVEMENTS
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Lessons Learned</h3>
            <textarea
              value={lessons}
              onChange={(e) => setLessons(e.target.value)}
              placeholder="What did you learn today?"
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-white placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange/50 transition-colors resize-y"
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Tomorrow&apos;s Improvements</h3>
            <textarea
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              placeholder="Specific, actionable goals for tomorrow"
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-white placeholder:text-chamber-text-dim focus:outline-none focus:border-chamber-orange/50 transition-colors resize-y"
            />
          </div>
        </div>
      </section>

      <hr className="border-chamber-border" />

      {/* ============================================================ */}
      {/* SAVE BUTTON                                                   */}
      {/* ============================================================ */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-lg bg-chamber-orange text-white font-bold tracking-wider text-sm hover:bg-[#ff7e33] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? "Saving..." : "SAVE JOURNAL ENTRY"}
      </button>

      {/* Save feedback */}
      {saveMessage && (
        <div
          className={`text-center text-sm py-2 rounded-lg ${
            saveMessage.startsWith("Error")
              ? "text-red-400 bg-red-500/10 border border-red-500/20"
              : "text-green-400 bg-green-500/10 border border-green-500/20"
          }`}
        >
          {saveMessage}
        </div>
      )}

      {/* ── Footer Disclaimer ── */}
      <div className="text-center mt-8 pb-4">
        <p className="text-[#333] text-[0.65rem] tracking-wider leading-relaxed">
          DAILY JOURNAL &middot; BASED ON ICT CONCEPTS &amp; JARED TENDLER&apos;S MENTAL GAME FRAMEWORK
        </p>
        <p className="text-[#292929] text-[0.58rem] mt-1">THIS IS NOT FINANCIAL ADVICE</p>
      </div>

      {/* ── Range slider custom styles ── */}
      <style jsx>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #e8651a;
          cursor: pointer;
          border: 2px solid #0a0a0a;
          box-shadow: 0 0 6px rgba(232, 101, 26, 0.5);
        }
        input[type="range"]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #e8651a;
          cursor: pointer;
          border: 2px solid #0a0a0a;
          box-shadow: 0 0 6px rgba(232, 101, 26, 0.5);
        }
        input[type="range"]::-webkit-slider-runnable-track {
          height: 8px;
          border-radius: 4px;
        }
        input[type="range"]::-moz-range-track {
          height: 8px;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
