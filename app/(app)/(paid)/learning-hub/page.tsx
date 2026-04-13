"use client";

export const dynamic = "force-dynamic";

import { useState, useRef, useCallback } from "react";

// ============================================================
// ICT CURRICULUM DATA
// ============================================================
const CURRICULUM = [
  {
    level: "Foundation",
    color: "#22c55e",
    icon: "I",
    topics: [
      {
        name: "Market Structure",
        description:
          "The skeleton of price action. Learn to read swing highs, swing lows, BOS, and MSS -- the foundation everything else builds on.",
        lessons: [
          "Market structure is the single most important concept in ICT trading. Before you can identify any entry model, you need to know the current directional bias — is price making higher highs and higher lows (bullish), or lower highs and lower lows (bearish)? Every other ICT concept is applied in the direction of the dominant structure.",
          "A Break of Structure (BOS) occurs when price closes beyond a previous swing high (in an uptrend) or swing low (in a downtrend). This confirms the existing trend is continuing. A Market Structure Shift (MSS) is different — it's the FIRST sign that the trend is changing direction. In a downtrend, an MSS happens when price breaks above the most recent lower high with a strong displacement candle.",
          "To identify swing points correctly, use a higher timeframe (HTF) first — daily or 4H — to establish the macro bias. Then drop to your execution timeframe (15m, 5m) to find the MSS and entry. Never trade against the HTF structure. The key rule: only look for longs when price is in a discount and has shifted structure bullish. Only look for shorts when price is in premium and has shifted structure bearish.",
        ],
      },
      {
        name: "Liquidity",
        description:
          "Where the money is. Smart money targets liquidity resting above highs and below lows. Learn to see where stops are sitting.",
        lessons: [
          "Liquidity is the fuel that powers institutional order flow. Large players (banks, hedge funds) cannot fill massive orders at a single price — they need a pool of orders on the other side of their trade. Retail traders' stop losses become the institutional traders' fill zones. Every equal high, every obvious resistance level, every prior day high/low is a pool of resting stop orders.",
          "Buy-side liquidity (BSL) sits above swing highs, equal highs, and prior day highs. This is where short sellers' stops are resting. Smart money will push price up to raid this liquidity before reversing lower. Sell-side liquidity (SSL) sits below swing lows, equal lows, and prior day lows — where long traders' stops are. A 'liquidity sweep' or 'stop hunt' is when price briefly breaks these levels, triggers the stops, and then reverses sharply.",
          "The practical application: never place your stop at obvious levels. If you're long, don't put your stop at the obvious swing low — that's where smart money is targeting. Also, when you see price sweeping an obvious liquidity level (like equal lows) and then showing a strong displacement candle in the opposite direction, that's a high-probability reversal signal. The sweep + MSS pattern is one of the most reliable setups in ICT methodology.",
        ],
      },
      {
        name: "Premium & Discount",
        description:
          "Buy low, sell high -- but with precision. The premium/discount model tells you WHERE in the range to look for entries.",
        lessons: [
          "The premium/discount concept is ICT's version of 'buy low, sell high,' but with a precise mathematical framework. Every dealing range — whether it's a daily range, a weekly range, or the range between a swing low and swing high — has an equilibrium point at exactly 50% (the CE, or Consequent Encroachment). Everything above 50% is premium. Everything below 50% is discount.",
          "The rule is simple but powerful: only buy in discount, only sell in premium. When price is in a downtrend, you look for short entries when price retraces into the premium zone (above 50% of the range). When price is in an uptrend, you look for long entries when price pulls back into the discount zone (below 50%). This prevents you from chasing entries at the top of moves.",
          "To apply this, draw a Fibonacci retracement from the swing low to the swing high of your current dealing range. The 50% level is equilibrium. The OTE (Optimal Trade Entry) zone sits at the 62-79% retracement — this is where price finds the most institutional interest for entries. When price retraces into the OTE zone AND you have a supporting confluence (OB, FVG, MSS), you have a high-probability entry. The deeper into discount (for longs) or premium (for shorts) you wait, the better your risk-to-reward.",
        ],
      },
    ],
  },
  {
    level: "Core Concepts",
    color: "#e8651a",
    icon: "II",
    topics: [
      {
        name: "Order Blocks",
        description:
          "The footprints of institutional orders. The last opposing candle before displacement -- your go-to entry model.",
        lessons: [
          "An Order Block (OB) is the last opposing candle before a significant displacement move. If price is about to move up aggressively, the OB is the last bearish (down) candle before the rally. If price is about to move down aggressively, the OB is the last bullish (up) candle before the drop. These represent price levels where institutional orders were placed — and when price returns to these levels, institutions re-enter to defend their positions.",
          "How to mark an OB: Find the displacement move first (large-bodied candles, minimal wicks, breaking structure). Then look left for the last candle that moved in the opposite direction immediately before that displacement. That candle's body (open to close) is your OB zone. For a bullish OB, the zone is from the candle's open down to its close (or low in some interpretations). The 50% level of the OB body (the CE) is the ideal entry point.",
          "Not all OBs are equal. The best OBs share these characteristics: (1) they form on a higher timeframe, (2) they are followed by immediate, strong displacement, (3) the displacement causes a BOS or MSS on the execution timeframe, (4) they sit in a discount (for bullish OBs) or premium (for bearish OBs). Avoid OBs that have been 'violated' — if price has already traded through the OB body and continued, that OB has been mitigated and is no longer valid.",
        ],
      },
      {
        name: "Fair Value Gaps",
        description:
          "Price imbalances that act as magnets. When candle 1 and candle 3 wicks don't overlap, there's unfinished business.",
        lessons: [
          "A Fair Value Gap (FVG) is a three-candle pattern where the high of candle 1 and the low of candle 3 do not overlap, leaving a gap in the price range that was never traded through both ways. In a bullish FVG, the low of candle 3 is higher than the high of candle 1 — the middle candle (candle 2) moved so aggressively that it created an imbalance. This gap represents 'unfinished business' that price will eventually return to fill.",
          "FVGs form during displacement — that's what makes them high-probability. When smart money moves price aggressively, they don't fill every order along the way. The resulting gap is where unfilled orders remain. When price returns to the FVG, it acts as a magnet, drawing price into the zone before continuing in the original direction. The CE (50% level) of the FVG is the ideal entry point for continuation trades.",
          "The hierarchy of FVGs: Not all gaps are equal. FVGs that form on higher timeframes (4H, daily) carry more weight than lower timeframe gaps. FVGs created during displacement that also causes a MSS are the strongest. To trade an FVG entry: wait for price to pull back into the FVG zone, look for a lower timeframe confirmation (a small rejection candle, a micro-MSS), and enter at or near the CE of the gap. Your stop goes below the FVG low (for bullish plays). The first target is the high that was created by the displacement.",
        ],
      },
      {
        name: "Displacement",
        description:
          "The signature of smart money. Large-bodied candles with small wicks showing aggressive, one-sided flow.",
        lessons: [
          "Displacement is the most important confirmation signal in ICT trading. It is the telltale signature of institutional order flow — large, impulsive candles with minimal wicks that break through structure with authority. Without displacement, you don't have confirmation of smart money involvement. A choppy or gradual break of a level is NOT displacement and should not be traded.",
          "The characteristics of true displacement: (1) Large candle body relative to recent price action, (2) Small wicks — if the candles have large wicks, it indicates two-sided trading and is not clean displacement, (3) Multiple consecutive candles in the same direction without significant pullbacks, (4) The move creates a Fair Value Gap in its wake, (5) The move breaks through a significant level (swing high/low, previous structure).",
          "Displacement is used in two ways: First, to identify valid Order Blocks and FVGs — only the OBs and FVGs created by displacement are worth trading. Second, as a real-time confirmation of an MSS. When you see price sweep a liquidity level and then immediately show displacement in the opposite direction, that's your signal to look for an entry on the first pullback into the FVG or OB left behind by that displacement move.",
        ],
      },
      {
        name: "Optimal Trade Entry",
        description:
          "The 62-79% fib zone. After an MSS, this is where you look for entries -- the sweet spot at 70.5%.",
        lessons: [
          "The Optimal Trade Entry (OTE) is a Fibonacci-based entry zone that defines WHERE to enter after a Market Structure Shift has been confirmed. After price sweeps liquidity and shows displacement creating an MSS, you draw a Fibonacci retracement from the originating swing point to the new high/low created by the MSS. The OTE zone sits between the 62% and 79% retracement levels, with the 70.5% level being the mathematical midpoint — the 'sweet spot.'",
          "Why this specific zone? Institutions accumulate their positions in stages. After their initial displacement move, they allow price to retrace to fill more orders at better prices before continuing. The 62-79% zone is where this secondary accumulation/distribution happens. By entering in the OTE, you're entering alongside smart money at their average fill price, rather than chasing the initial move.",
          "OTE setup checklist: (1) Identify the HTF bias — which direction is the dominant trend? (2) Wait for a liquidity sweep on your execution timeframe, (3) Confirm displacement and an MSS following the sweep, (4) Draw Fibonacci from the originating swing to the displacement high/low, (5) Look for price to pull back into the 62-79% zone, (6) Check for an OB or FVG within the OTE zone for added confluence, (7) Enter at 70.5% or at the CE of the OB/FVG within the zone. Stop goes below the OTE zone low (for longs). Target is at minimum 2:1 R:R.",
        ],
      },
    ],
  },
  {
    level: "Timing & Sessions",
    color: "#3b82f6",
    icon: "III",
    topics: [
      {
        name: "Kill Zones",
        description:
          "Not all hours are equal. London Open, NY Open, and London Close are where the highest-probability setups form.",
        lessons: [
          "Kill Zones are specific time windows during the trading day when institutional order flow is at its highest, creating the most reliable and high-probability setups. Trading outside of Kill Zones dramatically increases noise and reduces the reliability of ICT setups. The three primary Kill Zones are: London Open (2:00 AM – 5:00 AM EST), New York Open (7:00 AM – 10:00 AM EST), and London Close (10:00 AM – 12:00 PM EST).",
          "London Open Kill Zone (2–5 AM EST): London is the largest forex and futures market in the world. When London opens, large institutional players begin their trading day, creating the day's first significant directional push. This session often sets the high or low of the day. Look for price to sweep the Asian session's high or low (Asian range manipulation) and then reverse during this window. The move that begins in the London Kill Zone often runs into the New York session.",
          "New York Open Kill Zone (7–10 AM EST): The highest-volume window of the day. Both London and New York are open simultaneously during this period. The most explosive moves of the day typically occur here, especially between 9:30–10:00 AM when the US equity market opens. NY Open often creates the day's opposite extreme from what London created — if London made the daily low, NY Open is likely to make the daily high. This is the best window for larger intraday moves and Silver Bullet setups.",
        ],
      },
      {
        name: "Power of 3 (AMD)",
        description:
          "Every session follows the same script: accumulate, manipulate (fake out), then distribute (real move).",
        lessons: [
          "The Power of 3, also called the AMD model (Accumulation, Manipulation, Distribution), is ICT's framework for understanding how price moves within a single trading day or session. Every day, without exception, follows this three-phase script orchestrated by institutional players. Understanding AMD lets you stop being the victim of fake-outs and start anticipating them.",
          "Phase 1 — Accumulation: This happens during the Asian session (roughly 8 PM – 2 AM EST). Price moves in a relatively tight range as institutions are accumulating (building) their positions. This tight range creates a clear high and low that defines the 'manipulation target' for the next phase. Mark the Asian session high and low before London opens — these levels are critical.",
          "Phase 2 — Manipulation (the fake-out): At London Open (2–5 AM EST), price breaks out of the Asian range in the WRONG direction. If institutions plan to distribute (sell) the market higher into NY, they will first drive price DOWN below the Asian session low to trigger stop losses on long positions and create the liquidity they need to fill their massive sell orders. This fake-out move is the 'manipulation.' Phase 3 — Distribution: After sweeping the manipulation target (the Asian range extreme), price reverses sharply in the TRUE direction and makes the real move of the day. This distribution phase provides the trade opportunity — enter on the reversal after the sweep, in the direction of the true daily move.",
        ],
      },
      {
        name: "Silver Bullet",
        description:
          "Specific time windows (10-11 AM, 2-3 PM EST) where FVG entries have the highest probability.",
        lessons: [
          "The Silver Bullet is one of ICT's most specific and actionable entry strategies. It consists of two precise time windows: 10:00–11:00 AM EST and 2:00–3:00 PM EST. During these exact 60-minute windows, you wait for price to create a Fair Value Gap and then use that FVG as your entry model. No FVG outside these windows qualifies as a Silver Bullet setup.",
          "How to trade the Silver Bullet: (1) Establish your HTF bias for the day — bullish or bearish. (2) Watch for the start of the 10:00 AM or 2:00 PM window. (3) Within the window, look for a displacement move in the direction of your bias that creates an FVG. (4) Wait for price to pull back into the FVG. (5) Enter at the CE (50%) of the FVG. Stop goes just below the FVG low (for longs). Target is the opposing session high/low.",
          "The morning Silver Bullet window (10–11 AM) is generally more reliable because it occurs during the NY Open Kill Zone when volume is highest. The afternoon window (2–3 PM) can be effective for catching the afternoon session move but tends to have lower volume. Key filter: only take Silver Bullets that align with your HTF bias AND occur after a liquidity sweep. A Silver Bullet setup that forms against the HTF trend or without any prior liquidity sweep has significantly lower probability.",
        ],
      },
      {
        name: "ICT Macros",
        description:
          "Micro kill zones within sessions. Precise 20-minute windows where reversals and entries cluster.",
        lessons: [
          "ICT Macros are highly specific 20-minute windows within the trading day where price is algorithmically programmed to make directional moves. These are not random — they represent scheduled times when market makers and algorithms re-price the market. The key Macros are: 9:50–10:10 AM EST, 10:50–11:10 AM EST, 1:50–2:10 PM EST, and 3:15–3:45 PM EST (closing Macro).",
          "The morning Macros (9:50 and 10:50) are the most powerful. During the 9:50–10:10 window, price often makes a decisive move establishing the morning trend. If price sweeps a liquidity level going into 9:50 and then shows reversal displacement, that sets up the rest of the morning session direction. The 10:50–11:10 Macro often creates the second leg of the morning move or provides a secondary entry opportunity.",
          "Practical application: Set alerts for 9:50 AM, 10:50 AM, and 1:50 PM. As each Macro approaches, zoom to a 1-minute or 5-minute chart and watch price action closely. Look for a liquidity sweep immediately before or at the start of the Macro window, followed by displacement. The FVG created during a Macro window carries extra weight because it's algorithmically generated. Entries into Macro-created FVGs often have very precise 1:1 and 2:1 R:R targets.",
        ],
      },
    ],
  },
  {
    level: "Advanced",
    color: "#a855f7",
    icon: "IV",
    topics: [
      {
        name: "Breaker Blocks",
        description:
          "When an order block fails, it becomes a breaker -- support becomes resistance and vice versa.",
        lessons: [
          "A Breaker Block forms when a previously valid Order Block fails — price trades through the OB zone without respecting it and continues in the opposite direction. When this happens, the failed OB does not simply disappear. Instead, it 'flips' polarity and becomes a Breaker Block: a former bullish OB becomes a bearish Breaker, and a former bearish OB becomes a bullish Breaker.",
          "Why Breakers work: When price broke through the original OB, traders who bought (or sold) at that zone were trapped in losing positions. They're now holding onto hope, waiting for price to return so they can exit at breakeven. When price does return to the Breaker zone, this flood of breakeven exits adds to institutional selling pressure (for bearish Breakers), creating a reliable resistance zone that often leads to strong continuation in the new direction.",
          "Trading Breakers: A bearish Breaker Block should be used for short entries. Wait for price to retrace back into the Breaker zone after the break. Look for rejection confirmation on a lower timeframe (a bearish FVG, a bearish OB on the 5m or 1m). Enter short at the CE of the Breaker or at the 50-79% retracement of the zone. Your stop goes above the Breaker high. For high-probability Breakers, combine with HTF premium, a liquidity sweep, and a confirmed MSS on the execution timeframe.",
        ],
      },
      {
        name: "Mitigation Blocks",
        description:
          "Previous swing points that failed and get revisited. Price returns to mitigate the losses of trapped traders.",
        lessons: [
          "A Mitigation Block is a previous swing high or swing low that price failed to hold and broke through, leaving behind traders who are now trapped in losing positions. The concept is similar to Breaker Blocks but focuses specifically on swing points rather than OB candles. When price breaks through a significant swing level, the traders who entered at that swing point have open losses. They represent pending orders waiting to exit at breakeven when price returns.",
          "Identifying Mitigation Blocks: Look for swing highs that were broken during a bullish displacement move (these become bearish Mitigation Blocks) and swing lows broken during bearish displacement (these become bullish Mitigation Blocks). The exact price level of the swing high/low is the mitigation zone. Price will frequently return to these exact levels with precision before continuing in the displacement direction.",
          "Mitigation Blocks vs. Breaker Blocks: Breakers specifically reference the OB candle that was violated. Mitigation Blocks reference the broader swing point. In practice, they often coincide — a violated OB frequently sits at a significant swing point. When both a Breaker and a Mitigation Block align at the same level, you have extra confluence. Use Mitigation Blocks as additional confirmation when sizing your entries and placing stops, rather than as standalone entry models.",
        ],
      },
      {
        name: "Institutional Order Flow",
        description:
          "Reading the story across timeframes. Where is smart money positioned and where are they going?",
        lessons: [
          "Institutional Order Flow (IOF) is the overarching narrative that connects all ICT concepts together. It's the ability to read the market from the perspective of large institutions — banks, central banks, hedge funds — and understand their current positioning, their targets, and their methodology. Every ICT concept (OBs, FVGs, liquidity sweeps) is a tool for reading IOF. The goal is not just to find entries, but to understand WHY price is where it is and WHERE it's going.",
          "Reading IOF requires a top-down analysis process: Start with the monthly and weekly charts to understand the macro trend and identify major liquidity pools (equal highs/lows, previous swing points). Then the daily chart to identify the current dealing range and whether price is in premium or discount. Then the 4H to find the most recent displacement and structural shift. Finally, the 1H, 15m, and 5m to find the specific entry model (OB, FVG, OTE) within the context of the higher timeframe story.",
          "The key questions to ask at each timeframe: (1) What is the current market structure — bullish or bearish? (2) Is price in premium or discount relative to this range? (3) Where is the nearest liquidity pool that institutions need to reach? (4) Has there been a recent liquidity sweep + displacement + MSS? (5) What is the most recent FVG or OB that price has yet to mitigate? When you can answer all five questions from monthly down to 15m and they all align in the same direction, you have a high-conviction setup.",
        ],
      },
      {
        name: "PD Arrays & Propulsion Blocks",
        description:
          "The most advanced confluence -- when FVGs nest inside OBs, creating the highest-probability zones.",
        lessons: [
          "PD Arrays (Premium/Discount Arrays) are the full hierarchy of ICT's price delivery mechanisms — OBs, FVGs, Breakers, Mitigation Blocks, Liquidity Voids, and more — ranked by their probability and reliability. Understanding how to rank and combine these tools creates the highest-probability trade setups. The hierarchy from highest to lowest probability: Optimal Trade Entry (OTE) > Order Blocks > Fair Value Gaps > Breaker Blocks > Mitigation Blocks > Liquidity Voids.",
          "Propulsion Blocks are a specific advanced concept: they are OBs that align with FVGs at the same price level, creating nested confluence zones. When a Fair Value Gap sits inside an Order Block, the overlapping region is a Propulsion Block. These nested zones represent multiple layers of institutional interest at the same price, making them extremely high-probability reversal or continuation areas. The overlapping zone is where you focus your entry.",
          "Nesting PD Arrays: The most powerful setups in ICT occur when multiple PD arrays align at the same price zone across multiple timeframes. A daily OB that contains a 4H FVG that contains a 15m OTE — each layer adds confluence. When you find a zone where a higher timeframe OB, a mid-timeframe FVG, and a lower timeframe OTE all point to the same price area, and that area is in the correct premium/discount zone with a confirmed MSS, you have a tier-1 ICT setup. These are the setups worth sizing up on.",
        ],
      },
    ],
  },
  {
    level: "Risk & Psychology",
    color: "#ef4444",
    icon: "V",
    topics: [
      {
        name: "Risk Management",
        description:
          "The most important concept. Without proper risk management, nothing else matters.",
        lessons: [
          "Risk management is the foundation that makes everything else possible. Without it, even the best ICT setups will eventually blow your account. The core rule: never risk more than 1% of your account on any single trade. This means if your account is $10,000, your maximum loss per trade is $100. This rule sounds conservative but it's what keeps you in the game long enough for your edge to play out. A string of 10 consecutive losses only draws you down 10% — painful, but recoverable.",
          "Position sizing is the mechanism that enforces the 1% rule. The formula: Position Size = (Account Size × Risk %) ÷ (Entry Price – Stop Loss Price). Example: $10,000 account, 1% risk = $100 max loss. If your stop is 20 pips away and each pip is $10 on a standard lot, you can trade 0.5 mini lots. Never calculate position size based on 'how much I want to make' — always calculate from 'how much I'm willing to lose.' Your stop placement (based on structure) determines your position size, not the other way around.",
          "The psychological side of risk management: The 1% rule only works if you enforce it without exceptions. The greatest enemy is the impulse to 'make back' losses by sizing up after a losing streak. This is how accounts blow up — not from bad setups, but from emotional position sizing. Keep a trading journal (use the Journal page) and track not just your P&L but your adherence to the risk rules. Over 50+ trades, a 55% win rate with a 2:1 average R:R produces a 65% gain even if you lose 45% of trades. Trust the math, follow the rules, and the edge handles itself.",
        ],
      },
    ],
  },
];

// ============================================================
// TYPES & HELPERS
// ============================================================
interface KnowledgeChunk {
  id: string;
  content: string;
  source_video: string | null;
  source_url: string | null;
  tags: string[] | null;
  chunk_index: number | null;
  rank?: number;
}

type TopicCache = Record<string, KnowledgeChunk[]>;
type LoadingState = Record<string, boolean>;

const LEVEL_NAMES = ["All", ...CURRICULUM.map((s) => s.level)];
const TOTAL_TOPICS = CURRICULUM.reduce((s, c) => s + c.topics.length, 0);

// ============================================================
// LEARNING HUB PAGE
// ============================================================
export default function LearningHubPage() {
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [topicLoading, setTopicLoading] = useState<LoadingState>({});
  const cacheRef = useRef<TopicCache>({});

  const fetchTopicContent = useCallback(async (topicName: string) => {
    // Already cached
    if (cacheRef.current[topicName]) return;

    setTopicLoading((prev) => ({ ...prev, [topicName]: true }));

    try {
      const res = await fetch("/api/knowledge-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: topicName, limit: 5 }),
      });

      if (!res.ok) {
        cacheRef.current[topicName] = [];
        return;
      }

      const json = await res.json();
      cacheRef.current[topicName] = json.results ?? [];
    } catch {
      cacheRef.current[topicName] = [];
    } finally {
      setTopicLoading((prev) => ({ ...prev, [topicName]: false }));
    }
  }, []);

  const showSections =
    selectedLevel === "All"
      ? CURRICULUM
      : CURRICULUM.filter((s) => s.level === selectedLevel);

  const visibleTopics = showSections.reduce((s, c) => s + c.topics.length, 0);

  function toggleTopic(key: string, topicName: string) {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Trigger fetch when expanding (cache prevents re-fetch)
        fetchTopicContent(topicName);
      }
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <h1
        className="text-3xl font-bold tracking-[3px] text-chamber-orange"
        style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
      >
        LEARNING HUB
      </h1>
      <p className="text-chamber-text-dim text-[0.78rem] mb-5">
        Structured ICT curriculum pulled from 675+ of ICT&apos;s YouTube
        lectures
      </p>

      {/* ─── Level filter pills ───────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-2">
        {LEVEL_NAMES.map((level) => {
          const isActive = selectedLevel === level;
          // Find color for this level
          const section = CURRICULUM.find((s) => s.level === level);
          const color = section?.color ?? "#e8651a";

          return (
            <button
              key={level}
              onClick={() => setSelectedLevel(level)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                isActive
                  ? "text-white"
                  : "bg-chamber-surface border border-chamber-border text-chamber-text-dim hover:text-chamber-text hover:border-chamber-border-light"
              }`}
              style={
                isActive
                  ? {
                      background: `${color}22`,
                      border: `1px solid ${color}55`,
                      color,
                    }
                  : undefined
              }
            >
              {level}
            </button>
          );
        })}
      </div>

      <p className="text-chamber-text-dim text-[0.72rem] mb-4">
        Showing {visibleTopics} of {TOTAL_TOPICS} topics
      </p>

      {/* ─── Curriculum sections ──────────────────────────── */}
      {showSections.map((section) => (
        <div key={section.level} className="mb-6">
          {/* Section header card */}
          <div
            className="rounded-lg px-5 py-3.5 mb-3 flex items-center gap-3"
            style={{
              background: `${section.color}0F`,
              border: `1px solid ${section.color}22`,
              borderLeft: `3px solid ${section.color}`,
            }}
          >
            <span
              className="text-[0.65rem] font-extrabold tracking-widest rounded px-2 py-0.5"
              style={{
                color: section.color,
                border: `1px solid ${section.color}44`,
              }}
            >
              {section.icon}
            </span>
            <span
              className="font-bold text-[1.05rem]"
              style={{ color: section.color }}
            >
              {section.level}
            </span>
            <span className="text-chamber-text-dim text-[0.75rem] ml-auto">
              {section.topics.length} topic
              {section.topics.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Topics */}
          {section.topics.map((topic) => {
            const key = `${section.level}-${topic.name}`;
            const isOpen = expandedTopics.has(key);

            return (
              <div
                key={key}
                className="mb-2 bg-chamber-surface border border-chamber-border rounded-lg overflow-hidden"
              >
                {/* Topic header (clickable) */}
                <button
                  onClick={() => toggleTopic(key, topic.name)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="text-sm font-semibold text-chamber-text">
                    {topic.name}
                  </span>
                  <svg
                    className={`w-4 h-4 text-chamber-text-dim transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Description callout */}
                    <div
                      className="rounded-md px-4 py-3"
                      style={{
                        background: "#0e0e0e",
                        borderLeft: `2px solid ${section.color}44`,
                      }}
                    >
                      <p className="text-[#ccc] text-[0.85rem] leading-relaxed italic">
                        {topic.description}
                      </p>
                    </div>

                    {/* Hardcoded lesson content */}
                    {"lessons" in topic && Array.isArray(topic.lessons) && topic.lessons.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[0.7rem] tracking-wide uppercase mb-1" style={{ color: `${section.color}99` }}>
                          Lesson Notes
                        </p>
                        {topic.lessons.map((lesson, i) => (
                          <div
                            key={i}
                            className="rounded-md px-4 py-3"
                            style={{
                              background: "#111",
                              borderLeft: `2px solid ${section.color}33`,
                            }}
                          >
                            <p className="text-[#bbb] text-[0.82rem] leading-relaxed">
                              {lesson}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Transcript snippets from knowledge base (if DB is populated) */}
                    <LessonSnippets
                      topicName={topic.name}
                      loading={!!topicLoading[topic.name]}
                      chunks={cacheRef.current[topic.name]}
                      accentColor={section.color}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* ─── Footer ───────────────────────────────────────── */}
      <div className="text-center mt-8 leading-relaxed">
        <span className="text-[#333] text-[0.65rem] tracking-wide">
          CURRICULUM BASED ON ICT CONCEPTS &middot; 675+ TRANSCRIPTS INDEXED
        </span>
        <br />
        <span className="text-[#292929] text-[0.58rem]">
          THIS IS NOT FINANCIAL ADVICE
        </span>
      </div>
    </div>
  );
}

// ============================================================
// LESSON SNIPPETS COMPONENT
// ============================================================
function LessonSnippets({
  topicName,
  loading,
  chunks,
  accentColor,
}: {
  topicName: string;
  loading: boolean;
  chunks: KnowledgeChunk[] | undefined;
  accentColor: string;
}) {
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  // Loading skeleton
  if (loading) {
    return (
      <div className="mt-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-md px-4 py-3 animate-pulse"
            style={{ background: "#111" }}
          >
            <div className="h-3 bg-white/5 rounded w-3/4 mb-2" />
            <div className="h-3 bg-white/5 rounded w-full mb-1" />
            <div className="h-3 bg-white/5 rounded w-5/6" />
          </div>
        ))}
        <p className="text-chamber-text-dim text-[0.72rem] text-center pt-1">
          Searching transcripts for &ldquo;{topicName}&rdquo;...
        </p>
      </div>
    );
  }

  // No transcript results — silently hide rather than show an error
  if (!chunks || chunks.length === 0) return null;

  const SNIPPET_LEN = 500;

  function toggleChunkExpand(id: string) {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-chamber-text-dim text-[0.7rem] tracking-wide uppercase mb-1">
        From ICT Transcripts ({chunks.length} snippet{chunks.length !== 1 ? "s" : ""})
      </p>

      {chunks.map((chunk) => {
        const isTruncated = chunk.content.length > SNIPPET_LEN;
        const isExpanded = expandedChunks.has(chunk.id);
        const displayText = isExpanded
          ? chunk.content
          : chunk.content.slice(0, SNIPPET_LEN) +
            (isTruncated ? "..." : "");

        return (
          <div
            key={chunk.id}
            className="rounded-md px-4 py-3"
            style={{
              background: "#111",
              borderLeft: `2px solid ${accentColor}33`,
            }}
          >
            <p className="text-[#bbb] text-[0.82rem] leading-relaxed whitespace-pre-wrap">
              {displayText}
            </p>

            {/* Source citation */}
            {chunk.source_video && (
              <p
                className="mt-2 text-[0.7rem] font-medium"
                style={{ color: `${accentColor}99` }}
              >
                Source: {chunk.source_video}
              </p>
            )}

            {/* Read more toggle */}
            {isTruncated && (
              <button
                onClick={() => toggleChunkExpand(chunk.id)}
                className="mt-1 text-[0.75rem] font-medium hover:underline transition-colors"
                style={{ color: accentColor }}
              >
                {isExpanded ? "Show less" : "Read more"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
