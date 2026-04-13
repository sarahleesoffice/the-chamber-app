"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback } from "react";
import StatCard from "@/components/StatCard";
import { KnowledgeChunk } from "@/lib/types";

// ============================================================
// TAB DEFINITIONS
// ============================================================
const TABS = ["Search Knowledge Base", "ICT Concepts", "Videos", "Playlists"] as const;
type Tab = (typeof TABS)[number];

// ============================================================
// ICT CONCEPTS DATA
// ============================================================
const CONCEPT_CATEGORIES = [
  {
    category: "Market Structure",
    concepts: [
      { tag: "BOS", count: 142 },
      { tag: "MSS", count: 118 },
      { tag: "CHoCH", count: 87 },
      { tag: "Market Structure", count: 203 },
    ],
  },
  {
    category: "Order Flow",
    concepts: [
      { tag: "Order Blocks", count: 312 },
      { tag: "Breaker Blocks", count: 89 },
      { tag: "Mitigation Blocks", count: 64 },
    ],
  },
  {
    category: "Imbalances",
    concepts: [
      { tag: "FVG", count: 278 },
      { tag: "BISI", count: 56 },
      { tag: "SIBI", count: 52 },
      { tag: "Liquidity Void", count: 73 },
    ],
  },
  {
    category: "Liquidity",
    concepts: [
      { tag: "Buy-side", count: 189 },
      { tag: "Sell-side", count: 176 },
      { tag: "Equal Highs/Lows", count: 134 },
      { tag: "Trendline Liquidity", count: 47 },
    ],
  },
  {
    category: "Time & Price",
    concepts: [
      { tag: "Kill Zones", count: 156 },
      { tag: "Macros", count: 98 },
      { tag: "Silver Bullet", count: 112 },
      { tag: "Power of 3", count: 145 },
    ],
  },
  {
    category: "Entry Models",
    concepts: [
      { tag: "OTE", count: 167 },
      { tag: "Fibonacci", count: 124 },
      { tag: "Premium/Discount", count: 198 },
    ],
  },
];

// ============================================================
// PLACEHOLDER VIDEO DATA
// ============================================================
const PLACEHOLDER_VIDEOS = [
  "ICT Mentorship 2022 - Episode 1: Market Structure Basics",
  "ICT Mentorship 2022 - Episode 2: Liquidity Concepts",
  "ICT Mentorship 2022 - Episode 3: Order Block Theory",
  "ICT Mentorship 2022 - Episode 4: Fair Value Gaps Explained",
  "ICT Mentorship 2022 - Episode 5: Power of 3 (AMD)",
  "ICT Mentorship 2022 - Episode 6: Kill Zone Timing",
  "ICT Mentorship 2022 - Episode 7: OTE & Fibonacci Levels",
  "ICT Mentorship 2022 - Episode 8: Displacement & Delivery",
  "ICT Mentorship 2022 - Episode 9: Premium & Discount Arrays",
  "ICT Mentorship 2022 - Episode 10: Breaker Block Setups",
  "ICT Mentorship 2023 - Episode 1: Silver Bullet Model",
  "ICT Mentorship 2023 - Episode 2: Macros & Micro Windows",
  "ICT Mentorship 2023 - Episode 3: NDOG & NWOG",
  "ICT Mentorship 2023 - Episode 4: Institutional Order Entry Drill",
  "ICT Mentorship 2023 - Episode 5: Algorithmic Theory",
  "ICT Twitter Spaces - Live Market Breakdown (Jan 2023)",
  "ICT Twitter Spaces - FVG Masterclass (Feb 2023)",
  "ICT Twitter Spaces - Liquidity Engineering (Mar 2023)",
  "ICT YouTube - 2022 Mentorship Model Review",
  "ICT YouTube - How I Trade Index Futures",
  "ICT YouTube - The Only Video You Need on Order Blocks",
  "ICT YouTube - Mastering the 15-Minute Chart",
  "ICT YouTube - ICT Concepts Simplified for Beginners",
  "ICT YouTube - Smart Money Technique Explained",
  "ICT YouTube - AMD Cycle Walkthrough",
  "ICT Private Mentorship - Session 1: Foundational Concepts",
  "ICT Private Mentorship - Session 2: Multi-Timeframe Analysis",
  "ICT Private Mentorship - Session 3: Narrative Building",
  "ICT Private Mentorship - Session 4: Trade Plan Development",
  "ICT Private Mentorship - Session 5: Live Trade Execution",
  "ICT Charter Club - Week 1: Market Review",
  "ICT Charter Club - Week 2: Swing Trading Models",
  "ICT Charter Club - Week 3: Scalping Techniques",
  "ICT Charter Club - Week 4: Risk Management",
  "ICT Charter Club - Week 5: Position Sizing",
  "ICT Inner Circle Trader - Monthly Outlook Jan 2022",
  "ICT Inner Circle Trader - Monthly Outlook Feb 2022",
  "ICT Inner Circle Trader - Monthly Outlook Mar 2022",
  "ICT Inner Circle Trader - Monthly Outlook Apr 2022",
  "ICT Inner Circle Trader - Monthly Outlook May 2022",
  "ICT Core Content - Institutional Price Delivery Algorithm",
  "ICT Core Content - IPDA Data Ranges",
  "ICT Core Content - Dealing Ranges",
  "ICT Core Content - Turtle Soup",
  "ICT Core Content - Judas Swing",
  "ICT Core Content - London Swing to NY Continuation",
  "ICT Core Content - Stop Hunts & Sweeps",
  "ICT Core Content - Mitigation Block Theory",
  "ICT Core Content - Propulsion Blocks",
  "ICT Core Content - Rejection Blocks",
];

// ============================================================
// PLACEHOLDER PLAYLIST DATA
// ============================================================
const PLACEHOLDER_PLAYLISTS = [
  { name: "ICT Mentorship 2022", count: 247, videos: 42 },
  { name: "ICT Mentorship 2023", count: 189, videos: 31 },
  { name: "ICT Twitter Spaces", count: 312, videos: 56 },
  { name: "ICT YouTube Uploads", count: 876, videos: 148 },
  { name: "ICT Private Mentorship", count: 423, videos: 67 },
  { name: "ICT Charter Club", count: 298, videos: 48 },
  { name: "ICT Inner Circle Trader", count: 534, videos: 89 },
  { name: "ICT Core Content", count: 589, videos: 94 },
  { name: "ICT Live Streams", count: 0, videos: 100 },
];

// ============================================================
// COMPONENT
// ============================================================
export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<Tab>("Search Knowledge Base");
  const [searchQuery, setSearchQuery] = useState("");
  const [resultCount, setResultCount] = useState(5);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeChunk[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<string | null>(null);
  const [videosShown, setVideosShown] = useState(20);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearched(true);
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setSearchMode(null);
    try {
      const res = await fetch("/api/knowledge-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, limit: resultCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setSearchResults(data.results ?? []);
      setSearchMode(data.mode ?? null);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, resultCount]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
        <p className="text-chamber-text-muted text-sm mt-1">
          675 ICT teaching transcripts indexed and searchable with semantic
          vector search
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Chunks" value="3,468" color="#e8651a" />
        <StatCard label="Videos" value="675" color="#3b82f6" />
        <StatCard label="Total Words" value="~2.5M" color="#22c55e" />
        <StatCard label="Tagged" value="87%" color="#a855f7" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-chamber-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab
                ? "text-[#e8651a] border-b-2 border-[#e8651a]"
                : "text-chamber-text-muted hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Search Knowledge Base" && (
        <SearchTab
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          resultCount={resultCount}
          setResultCount={setResultCount}
          searched={searched}
          searching={searching}
          searchResults={searchResults}
          searchError={searchError}
          searchMode={searchMode}
          onSearch={handleSearch}
        />
      )}

      {activeTab === "ICT Concepts" && <ConceptsTab />}

      {activeTab === "Videos" && (
        <VideosTab
          videosShown={videosShown}
          onLoadMore={() =>
            setVideosShown((prev) =>
              Math.min(prev + 20, PLACEHOLDER_VIDEOS.length)
            )
          }
        />
      )}

      {activeTab === "Playlists" && <PlaylistsTab />}
    </div>
  );
}

// ============================================================
// SEARCH TAB
// ============================================================
function SearchTab({
  searchQuery,
  setSearchQuery,
  resultCount,
  setResultCount,
  searched,
  searching,
  searchResults,
  searchError,
  searchMode,
  onSearch,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  resultCount: number;
  setResultCount: (v: number) => void;
  searched: boolean;
  searching: boolean;
  searchResults: KnowledgeChunk[];
  searchError: string | null;
  searchMode: string | null;
  onSearch: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Search Input Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="e.g. order block entry during New York session"
            className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-chamber-text-dim focus:outline-none focus:border-[#e8651a]/50 transition-colors"
          />
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-chamber-text-muted text-xs whitespace-nowrap">
            Results:
          </label>
          <select
            value={resultCount}
            onChange={(e) => setResultCount(Number(e.target.value))}
            className="bg-chamber-surface border border-chamber-border rounded-lg px-2 py-2.5 text-white text-sm focus:outline-none focus:border-[#e8651a]/50"
          >
            {[1, 2, 3, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            onClick={onSearch}
            disabled={searching}
            className="bg-[#e8651a] hover:bg-[#ff7e33] disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {/* Search Results */}
      {searching && (
        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 text-center">
          <div className="text-[#e8651a] text-2xl mb-3 animate-pulse">
            &#x1F50D;
          </div>
          <p className="text-chamber-text-muted text-sm">
            Searching knowledge base...
          </p>
        </div>
      )}

      {!searching && searchError && (
        <div className="bg-chamber-surface border border-red-500/30 rounded-lg p-6 text-center">
          <p className="text-red-400 text-sm font-medium mb-1">Search Error</p>
          <p className="text-chamber-text-muted text-sm">{searchError}</p>
        </div>
      )}

      {!searching && searched && !searchError && searchResults.length === 0 && (
        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 text-center">
          <div className="text-chamber-text-dim text-3xl mb-3">&#x1F50D;</div>
          <p className="text-white font-medium mb-1">No results found</p>
          <p className="text-chamber-text-muted text-sm">
            Try different keywords or a broader search term.
          </p>
        </div>
      )}

      {!searching && searchResults.length > 0 && (
        <div className="space-y-3">
          <p className="text-chamber-text-muted text-xs">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
            {searchMode === "fulltext" && " (full-text search)"}
            {searchMode === "keyword_fallback" && " (keyword match)"}
            {searchMode === "vector" && " (semantic search)"}
          </p>
          {searchResults.map((chunk, i) => (
            <div
              key={chunk.id ?? i}
              className="bg-chamber-surface border border-chamber-border rounded-lg p-4 hover:border-[rgba(232,101,26,0.35)] transition-colors"
            >
              {/* Header: source + relevance */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  {chunk.source_video && (
                    <p className="text-[#e8651a] text-xs font-medium truncate">
                      {chunk.source_video}
                    </p>
                  )}
                </div>
                {(chunk.similarity ?? chunk.rank) != null && (
                  <span
                    className="shrink-0 text-[0.65rem] font-mono rounded px-1.5 py-0.5"
                    style={{
                      background: "rgba(232,101,26,0.1)",
                      color: "#ff7e33",
                    }}
                  >
                    {((chunk.similarity ?? chunk.rank ?? 0) * 100).toFixed(0)}%
                    match
                  </span>
                )}
              </div>

              {/* Content */}
              <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">
                {chunk.content}
              </p>

              {/* Tags */}
              {chunk.tags && chunk.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {chunk.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[0.65rem] rounded-full px-2 py-0.5"
                      style={{
                        background: "rgba(232,101,26,0.1)",
                        border: "1px solid rgba(232,101,26,0.2)",
                        color: "#e8651a",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer: source URL + chunk index */}
              {(chunk.source_url || chunk.chunk_index != null) && (
                <div className="flex items-center gap-3 mt-2 text-chamber-text-dim text-[0.65rem]">
                  {chunk.chunk_index != null && (
                    <span>Chunk #{chunk.chunk_index}</span>
                  )}
                  {chunk.source_url && (
                    <a
                      href={chunk.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#e8651a] transition-colors truncate"
                    >
                      {chunk.source_url}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!searched && !searching && (
        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-6 text-center">
          <div className="text-chamber-text-dim text-3xl mb-3">&#x1F4DA;</div>
          <p className="text-chamber-text-muted text-sm">
            Search ICT teachings across 675 video transcripts. Enter a concept,
            setup, or question above.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONCEPTS TAB
// ============================================================
function ConceptsTab() {
  return (
    <div className="space-y-6">
      {CONCEPT_CATEGORIES.map((cat) => (
        <div key={cat.category}>
          <h3 className="text-white font-semibold text-sm mb-3">
            {cat.category}
          </h3>
          <div className="flex flex-wrap gap-2">
            {cat.concepts.map((c) => (
              <span
                key={c.tag}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium cursor-default transition-colors hover:bg-[rgba(232,101,26,0.2)]"
                style={{
                  background: "rgba(232,101,26,0.1)",
                  border: "1px solid rgba(232,101,26,0.25)",
                  color: "#e8651a",
                }}
              >
                {c.tag}
                <span
                  className="inline-flex items-center justify-center rounded-full text-[0.65rem] font-bold min-w-[1.25rem] h-[1.25rem] px-1"
                  style={{
                    background: "rgba(232,101,26,0.2)",
                    color: "#ff7e33",
                  }}
                >
                  {c.count}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// VIDEOS TAB
// ============================================================
function VideosTab({
  videosShown,
  onLoadMore,
}: {
  videosShown: number;
  onLoadMore: () => void;
}) {
  const visible = PLACEHOLDER_VIDEOS.slice(0, videosShown);
  const hasMore = videosShown < PLACEHOLDER_VIDEOS.length;

  return (
    <div className="space-y-2">
      <p className="text-chamber-text-muted text-xs mb-2">
        Showing {visible.length} of {PLACEHOLDER_VIDEOS.length} videos
        (placeholder data — full list from transcript index coming soon)
      </p>
      {visible.map((title, i) => (
        <div
          key={i}
          className="flex items-center gap-3 bg-chamber-surface border border-chamber-border rounded-lg px-4 py-3 hover:border-[rgba(232,101,26,0.35)] transition-colors"
        >
          <span className="text-chamber-text-dim text-xs font-mono w-6 text-right shrink-0">
            {i + 1}
          </span>
          <span className="text-white text-sm">{title}</span>
        </div>
      ))}
      {hasMore && (
        <button
          onClick={onLoadMore}
          className="w-full mt-2 py-2.5 rounded-lg text-sm font-medium text-[#e8651a] border border-[rgba(232,101,26,0.3)] hover:bg-[rgba(232,101,26,0.08)] transition-colors"
        >
          Load more
        </button>
      )}
    </div>
  );
}

// ============================================================
// PLAYLISTS TAB
// ============================================================
function PlaylistsTab() {
  return (
    <div className="space-y-2">
      <p className="text-chamber-text-muted text-xs mb-2">
        Playlist data will be populated from the transcript index after
        migration.
      </p>
      {PLACEHOLDER_PLAYLISTS.map((pl) => (
        <div
          key={pl.name}
          className="flex items-center justify-between bg-chamber-surface border border-chamber-border rounded-lg px-4 py-3 hover:border-[rgba(232,101,26,0.35)] transition-colors"
        >
          <div>
            <span className="text-white text-sm font-medium">{pl.name}</span>
            <span className="text-chamber-text-dim text-xs ml-2">
              {pl.videos} videos
            </span>
          </div>
          <span
            className="text-xs font-medium rounded-full px-2.5 py-0.5"
            style={{
              background: "rgba(232,101,26,0.1)",
              border: "1px solid rgba(232,101,26,0.25)",
              color: "#e8651a",
            }}
          >
            {pl.count} chunks
          </span>
        </div>
      ))}
    </div>
  );
}
