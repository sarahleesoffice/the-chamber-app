/**
 * SMC concept detection shared by AI SMC Chat and AI Analysis, plus the
 * lecture-transcript search (knowledge_chunks) that grounds their answers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** Keywords per concept, used to score study-card titles. */
export const SMC_CONCEPTS: Record<string, string[]> = {
  "order block": ["order", "block"],
  "fair value gap": ["fair", "value", "gap"],
  "fvg": ["fair", "value", "gap", "fvg"],
  "ote": ["optimal", "trade", "entry", "ote"],
  "optimal trade entry": ["optimal", "trade", "entry"],
  "breaker block": ["breaker", "block"],
  "mitigation block": ["mitigation", "block"],
  "rejection block": ["rejection", "block"],
  "propulsion block": ["propulsion", "block"],
  "vacuum block": ["vacuum", "block"],
  "reclaimed order block": ["reclaimed", "order", "block"],
  "judas swing": ["judas", "swing"],
  "kill zone": ["kill", "zone"],
  "silver bullet": ["silver", "bullet"],
  "macro": ["macro", "macros"],
  "liquidity": ["liquidity"],
  "liquidity void": ["liquidity", "void"],
  "liquidity pool": ["liquidity", "pool"],
  "market structure": ["market", "structure"],
  "market maker": ["market", "maker"],
  "turtle soup": ["turtle", "soup"],
  "power of 3": ["power"],
  "displacement": ["displacement"],
  "top down analysis": ["top", "down", "analysis"],
  "bias": ["bias", "higher", "timeframe"],
  "interest rate": ["interest", "rate"],
  "sentiment": ["sentiment"],
  "unicorn": ["unicorn"],
  "2022 model": ["2022", "model"],
};

// Which SMC concept(s) the user is asking about: whole words plus common shorthand
// ("retracement" → OTE, "msb" → structure, "swept" → liquidity). Ordered so entry
// and setup models outrank context terms; the first match is the main topic.
export const CONCEPT_PATTERNS: [string, RegExp][] = [
  ["silver bullet", /\bsilver bullet\b/],
  ["unicorn", /\bunicorn\b/],
  ["judas swing", /\bjudas\b/],
  ["turtle soup", /\bturtle soup\b/],
  ["2022 model", /\b2022 (entry )?model\b/],
  ["ote", /\b(ote|optimal trade entry|retrace(ment|ments|s|d)?|pull ?backs?|fib(onacci)?)\b/],
  ["fair value gap", /\b(fvgs?|fair value gaps?|imbalances?|inefficienc(y|ies)|consequent encroachment)\b/],
  ["breaker block", /\bbreakers?( blocks?)?\b/],
  ["mitigation block", /\bmitigation blocks?\b/],
  ["rejection block", /\brejection blocks?\b/],
  ["propulsion block", /\bpropulsion blocks?\b/],
  ["vacuum block", /\bvacuum blocks?\b/],
  ["order block", /\b(obs?|order blocks?)\b/],
  ["kill zone", /\bkill ?zones?\b/],
  ["macro", /\bmacros?\b/],
  ["power of 3", /\b(power of (3|three)|amd|po3)\b/],
  ["displacement", /\bdisplacement\b/],
  ["top down analysis", /\btop ?down\b/],
  ["bias", /\b(bias|htf|higher time ?frame)\b/],
  ["market maker", /\bmarket makers?\b/],
  ["market structure", /\b(msb|mss|bos|choch|market structure|structure (break|shift))\b/],
  ["liquidity void", /\bliquidity voids?\b/],
  ["liquidity pool", /\bliquidity pools?\b/],
  ["liquidity", /\b(liquidity|sweeps?|swept|raid(s|ed)?|ssl|bsl|sell ?side|buy ?side|stop hunts?|purge)\b/],
  ["interest rate", /\binterest rates?\b/],
  ["sentiment", /\bsentiment\b/],
];

/** Concepts mentioned in a piece of text, main topic first. */
export function detectConcepts(text: string): string[] {
  const lower = text.toLowerCase();
  return CONCEPT_PATTERNS.filter(([, re]) => re.test(lower)).map(([c]) => c);
}

// What to search the lecture transcripts for, per concept. Phrases are specific
// enough to rank well; the default is the concept name itself.
const LECTURE_SEARCH: Record<string, string> = {
  "ote": "optimal trade entry",
  "market structure": "market structure shift",
  "liquidity": "sell side liquidity",
  "power of 3": "power of three",
  "bias": "daily bias",
  "top down analysis": "higher time frame",
};

const STOP = new Set(["what", "when", "where", "which", "would", "could", "should", "about", "there", "their", "this", "that", "with", "from", "have", "been", "does", "dont", "sometimes", "trade", "trading", "market", "price", "think", "know", "like", "just", "really", "into", "your", "mine"]);

export interface LectureExcerpt {
  video: string;
  url: string | null;
  text: string;
}

/**
 * Find lecture excerpts for the topics in `text`: up to 3 from the main topic
 * and 1 from each of the next two, at most 2 per video. Searches run in
 * parallel and are capped at `timeoutMs`, so a slow search never holds up a reply.
 */
export async function findLectureExcerpts(
  supabase: SupabaseClient,
  text: string,
  { max = 4, chars = 1000, timeoutMs = 4000 } = {}
): Promise<LectureExcerpt[]> {
  const concepts = detectConcepts(text).slice(0, 3);
  let plan: [string, number][] = concepts.map((c, i) => [LECTURE_SEARCH[c] || c, i === 0 ? 3 : 1]);
  if (plan.length === 0) {
    // No known concept: try the two most specific words on their own
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP.has(w))
      .sort((x, y) => y.length - x.length)
      .slice(0, 2);
    plan = words.map((w) => [w, 2]);
  }
  if (plan.length === 0) return [];

  const signal = AbortSignal.timeout(timeoutMs);
  const results = await Promise.all(
    plan.map(([query, count]) =>
      supabase
        .rpc("search_knowledge_text", { search_query: query, match_count: count + 2 })
        .abortSignal(signal)
        .then(({ data }) => (data || []) as { id: string; content: string; source_video: string | null; source_url: string | null }[])
        .then((rows) => rows.slice(0, count + 2), () => [])
    )
  );

  const seen = new Set<string>();
  const perVideo = new Map<string, number>();
  const out: LectureExcerpt[] = [];
  results.forEach((rows, i) => {
    let taken = 0;
    for (const r of rows) {
      if (out.length >= max || taken >= plan[i][1]) break;
      const video = r.source_video || "SMC lecture";
      if (seen.has(r.id) || (perVideo.get(video) || 0) >= 2) continue;
      seen.add(r.id);
      perVideo.set(video, (perVideo.get(video) || 0) + 1);
      out.push({ video, url: r.source_url, text: r.content.replace(/\s+/g, " ").trim().slice(0, chars) });
      taken++;
    }
  });
  return out;
}
