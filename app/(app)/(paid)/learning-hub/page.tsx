"use client";

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
      },
      {
        name: "Liquidity",
        description:
          "Where the money is. Smart money targets liquidity resting above highs and below lows. Learn to see where stops are sitting.",
      },
      {
        name: "Premium & Discount",
        description:
          "Buy low, sell high -- but with precision. The premium/discount model tells you WHERE in the range to look for entries.",
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
      },
      {
        name: "Fair Value Gaps",
        description:
          "Price imbalances that act as magnets. When candle 1 and candle 3 wicks don't overlap, there's unfinished business.",
      },
      {
        name: "Displacement",
        description:
          "The signature of smart money. Large-bodied candles with small wicks showing aggressive, one-sided flow.",
      },
      {
        name: "Optimal Trade Entry",
        description:
          "The 62-79% fib zone. After an MSS, this is where you look for entries -- the sweet spot at 70.5%.",
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
      },
      {
        name: "Power of 3 (AMD)",
        description:
          "Every session follows the same script: accumulate, manipulate (fake out), then distribute (real move).",
      },
      {
        name: "Silver Bullet",
        description:
          "Specific time windows (10-11 AM, 2-3 PM EST) where FVG entries have the highest probability.",
      },
      {
        name: "ICT Macros",
        description:
          "Micro kill zones within sessions. Precise 20-minute windows where reversals and entries cluster.",
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
      },
      {
        name: "Mitigation Blocks",
        description:
          "Previous swing points that failed and get revisited. Price returns to mitigate the losses of trapped traders.",
      },
      {
        name: "Institutional Order Flow",
        description:
          "Reading the story across timeframes. Where is smart money positioned and where are they going?",
      },
      {
        name: "PD Arrays & Propulsion Blocks",
        description:
          "The most advanced confluence -- when FVGs nest inside OBs, creating the highest-probability zones.",
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
                  <div className="px-4 pb-4">
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

                    {/* Lesson snippets from knowledge base */}
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

  // No results
  if (chunks && chunks.length === 0) {
    return (
      <div className="text-center py-3">
        <span className="text-chamber-text-dim text-[0.8rem]">
          No lesson content found for this topic yet.
        </span>
      </div>
    );
  }

  // Not yet loaded (shouldn't normally show, but safe fallback)
  if (!chunks) return null;

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
