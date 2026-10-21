import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderError, type ChatImage, generate, pickKey } from "@/lib/ai-providers";
import { getUserApiKeys } from "@/lib/api-keys";
import { accessDenied } from "@/lib/access";
import { ndjsonResponse } from "@/lib/ndjson";
import { findLectureExcerpts } from "@/lib/smc-concepts";
import { MENTOR_ANALYSIS_STYLE, MENTOR_VOICE, isMentorId, type MentorId } from "@/lib/mentors";

// Framework + output format shared by every mentor; the mentor's voice and grading angle are prepended per request.
const SMC_ANALYSIS_SYSTEM_PROMPT = `You are reviewing a member's trade inside "The Chamber" trading app, built on SMC (Smart Money Concepts) methodology.

## SMC FRAMEWORK — CORE CONCEPTS

**Market Structure:**
- Break of Structure (BOS) vs Change of Character (CHoCH)
- Swing highs/lows, internal vs external structure
- Higher timeframe (HTF) bias determines trade direction — always trade WITH the HTF flow
- Internal range liquidity vs external range liquidity

**Order Blocks (OB):**
- Bullish OB = last down candle before displacement up; Bearish OB = last up candle before displacement down
- Must have displacement + FVG to be valid — an OB without displacement is just a candle
- Refined vs unrefined OBs, mitigation vs respecting an OB
- Breaker blocks (failed OBs that flip), mitigation blocks, reclaimed OBs

**Fair Value Gaps (FVG):**
- Three-candle pattern: gap between candle 1 high and candle 3 low (bullish) or candle 1 low and candle 3 high (bearish)
- BISI (buyside imbalance, sellside inefficiency) = bullish FVG
- SIBI (sellside imbalance, buyside inefficiency) = bearish FVG
- Inversion FVGs (IFVG): when price trades through an FVG and it flips role
- Consequent Encroachment (CE) = 50% of the FVG, key level

**Liquidity:**
- Buy-side liquidity (BSL) = above swing highs, equal highs
- Sell-side liquidity (SSL) = below swing lows, equal lows
- Liquidity sweeps/raids/purges — engineered moves to take stops
- The "draw on liquidity" concept — where is price likely going?
- Old highs/lows, relative equal highs/lows as liquidity targets

**Time & Session:**
- Kill Zones: London (2-5 AM ET), NY AM (9:30-12 PM ET), NY PM (1:30-4 PM ET), Asian (7-10 PM ET)
- SMC Macros: 9:50-10:10, 10:50-11:10, 1:50-2:10, 3:15-3:45 (the micro windows where moves start)
- Silver Bullet: 10:00-11:00 AM ET and 2:00-3:00 PM ET (high-probability entry windows)
- Power of 3 / AMD: Accumulation → Manipulation → Distribution (the daily/session cycle)
- Judas Swing: the initial fake move opposite to the true direction, often at session open
- True day, turtle soup, opening range gap

**Entry Models:**
- Optimal Trade Entry (OTE): 62-79% fib retracement of an expansion leg
- SMC 2022 model: sweep liquidity → displacement → FVG entry (the core 2022 entry model)
- Unicorn entry: OB nested inside an FVG
- Premium (above 50% / equilibrium) for shorts, Discount (below 50%) for longs
- Scale-in entries: adding at multiple levels within a PD array

**Risk & Psychology:**
- "Trade small, trade often" — position sizing discipline
- Focus on pips/points, not dollars
- 1-2% risk per trade maximum
- Revenge trading, overtrading, FOMO — common pitfalls to avoid
- Journal every trade — The Chamber exists to enforce this habit

ANALYSIS INSTRUCTIONS

When analyzing a trade:
- Evaluate using SMC concepts with specific feedback
- If the trader scaled in/out, evaluate the strategy
- Identify strengths and areas for improvement
- Rate the trade 1-10

FORMATTING RULES — VERY IMPORTANT:
- DO NOT use markdown headers (no # or ##)
- DO NOT use bold markers (no ** or __)
- Use plain text only with line breaks
- Keep it concise — aim for 300-400 words max
- Stay in your own voice (defined above). Section emojis below are part of the format; beyond those, follow your voice rules on emoji use. NEVER use the 💯 emoji

Format your response EXACTLY like this:

SMC Rating: [X]/10

✅ What you did well:
- [short bullet, reference SMC concept]
- [short bullet]

⚠️ What to work on:
- [short bullet with actionable tip]
- [short bullet]

📊 Breakdown:
[2-3 short paragraphs. Cover entry quality, timing, structure, liquidity targets. Be specific to THIS trade, not generic. Keep it tight.]

🎯 Key takeaway:
[One sentence — the most important lesson.]

This is educational analysis based on SMC methodology, not financial advice.

Rules:
- Be direct, not robotic
- Reference SMC concepts naturally, don't just list them
- If multiple trades, give a quick take on each then an overall session note
- NEVER use ## or ** in your response — plain text only`;


interface AnalysisRequest {
  stream?: boolean;
  mentor?: string;
  pair?: string;
  direction?: string;
  entry_price?: string;
  exit_price?: string;
  trade_date?: string;
  reasoning?: string;
  focus?: string;
  chart_descriptions?: string[];
  chart_urls?: string[];
}

function buildUserMessage(req: AnalysisRequest): string {
  const parts: string[] = ["Please analyze my trade with the following details:\n"];

  if (req.pair) parts.push(`Pair: ${req.pair}`);
  if (req.direction) parts.push(`Direction: ${req.direction}`);
  if (req.entry_price) parts.push(`Entry Price: ${req.entry_price}`);
  if (req.exit_price) parts.push(`Exit Price: ${req.exit_price}`);
  if (req.trade_date) parts.push(`Trade Date: ${req.trade_date}`);

  if (req.chart_descriptions && req.chart_descriptions.length > 0) {
    parts.push("\nChart Descriptions:");
    req.chart_descriptions.forEach((desc, i) => {
      parts.push(`Chart ${i + 1}: ${desc}`);
    });
  }

  if (req.reasoning) {
    parts.push(`\nTrader's Reasoning: ${req.reasoning}`);
  }

  if (req.focus) {
    parts.push(`\nSpecific Question/Focus: ${req.focus}`);
  }

  return parts.join("\n");
}

const CHART_PATH_MARKER = "/storage/v1/object/public/charts/";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit

/**
 * Load the uploaded chart screenshots so the model actually sees them. Only
 * charts in the caller's own storage folder are read, so a request can't pull
 * anyone else's files or make the server fetch arbitrary URLs.
 */
async function loadChartImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  urls: string[] = []
): Promise<ChatImage[]> {
  const images: ChatImage[] = [];
  for (const url of urls.slice(0, 3)) {
    const at = url.indexOf(CHART_PATH_MARKER);
    if (at === -1) continue;
    const path = decodeURIComponent(url.slice(at + CHART_PATH_MARKER.length).split("?")[0]);
    if (!path.startsWith(`${userId}/`)) continue;
    const { data, error } = await supabase.storage.from("charts").download(path);
    if (error || !data || data.size > MAX_IMAGE_BYTES) continue;
    const mediaType = data.type || (/\.png$/i.test(path) ? "image/png" : "image/jpeg");
    if (!IMAGE_TYPES.has(mediaType)) continue;
    images.push({ base64: Buffer.from(await data.arrayBuffer()).toString("base64"), mediaType });
  }
  return images;
}

function extractScore(text: string): number | null {
  // Match "SMC Rating: 7/10" or "SMC Rating: 7.5/10" etc.
  const match = text.match(/SMC\s+Rating:\s*([\d.]+)\s*\/\s*10/i);
  if (match) {
    const score = parseFloat(match[1]);
    if (score >= 0 && score <= 10) return score;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    const denied = await accessDenied(user);
    if (denied) return denied;

    const body: AnalysisRequest = await req.json();
    const mentor: MentorId = isMentorId(body.mentor) ? body.mentor : "ember";
    // Charts and lecture excerpts for the topics in the trader's reasoning, in parallel
    const [images, lectures] = await Promise.all([
      loadChartImages(supabase, user.id, body.chart_urls),
      findLectureExcerpts(supabase, [body.reasoning, body.focus].filter(Boolean).join(" ")),
    ]);
    let userMessage = buildUserMessage(body);
    if (lectures.length > 0) {
      userMessage +=
        "\n\nRelevant SMC lecture excerpts (ground your feedback in what these teach where they apply; don't quote them at length):\n" +
        lectures.map((l) => `[${l.video}]: ${l.text}`).join("\n\n");
    }
    if (images.length > 0) {
      userMessage += `\n\nThe ${images.length} chart screenshot${images.length > 1 ? "s are" : " is"} attached as image${images.length > 1 ? "s" : ""}, in the same order as the chart descriptions above. Read them directly: structure, liquidity, PD arrays, entry and exit.`;
    }

    // Get user's API key (decrypted server-side): the provider they chose in
    // Settings, else the first they have
    const key = pickKey(await getUserApiKeys(user.id), user.user_metadata?.ai_provider);
    if (!key) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    const options = {
      provider: key.provider,
      apiKey: key.key,
      model: user.user_metadata?.openrouter_model,
      system: `${MENTOR_VOICE[mentor]}\n\n${SMC_ANALYSIS_SYSTEM_PROMPT}\n\nYOUR ANGLE ON THIS TRADE\n${MENTOR_ANALYSIS_STYLE[mentor]}`,
      messages: [{ role: "user" as const, text: userMessage, images }],
      maxTokens: 2048,
      effort: "medium" as const,
    };

    // Score the finished analysis and save it to the user's history
    const saveAnalysis = async (text: string, provider: string, model: string) => {
      const analysisText = text || "No response from the AI.";
      const ictScore = extractScore(analysisText);
      const { error: insertError } = await supabase.from("analyses").insert({
        user_id: user.id,
        provider,
        model,
        analysis_text: analysisText,
        pair: body.pair || null,
        direction: body.direction || null,
        entry_price: body.entry_price || null,
        exit_price: body.exit_price || null,
        trade_date: body.trade_date || null,
        reasoning: body.reasoning || null,
        focus: body.focus || null,
        mentor,
        ict_score: ictScore,
        chart_urls: body.chart_urls || null,
      });
      if (insertError) {
        console.error("Failed to save analysis:", insertError);
        // Still return the analysis even if saving fails
      }
      return { analysis: analysisText, score: ictScore, provider, model, mentor };
    };

    // Streaming: the analysis shows up as it's written instead of after a long wait
    if (body.stream) {
      return ndjsonResponse(async (send) => {
        const { text, provider, model } = await generate(options, (t) => send({ t }));
        send({ done: true, ...(await saveAnalysis(text, provider, model)) });
      });
    }

    const { text, provider, model } = await generate(options);
    return NextResponse.json(await saveAnalysis(text, provider, model));
  } catch (err: unknown) {
    if (err instanceof AIProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
