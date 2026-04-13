import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ICT_ANALYSIS_SYSTEM_PROMPT = `You are an expert ICT (Inner Circle Trader) methodology trade analyst inside "The Chamber" trading app. You have deep knowledge of ICT's actual teachings from his mentorship content.

## ICT FRAMEWORK — CORE CONCEPTS

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
- ICT Macros: 9:50-10:10, 10:50-11:10, 1:50-2:10, 3:15-3:45 (the micro windows where moves start)
- Silver Bullet: 10:00-11:00 AM ET and 2:00-3:00 PM ET (high-probability entry windows)
- Power of 3 / AMD: Accumulation → Manipulation → Distribution (the daily/session cycle)
- Judas Swing: the initial fake move opposite to the true direction, often at session open
- True day, turtle soup, opening range gap

**Entry Models:**
- Optimal Trade Entry (OTE): 62-79% fib retracement of an expansion leg
- ICT 2022 model: sweep liquidity → displacement → FVG entry (the core 2022 entry model)
- Unicorn entry: OB nested inside an FVG
- Premium (above 50% / equilibrium) for shorts, Discount (below 50%) for longs
- Scale-in entries: adding at multiple levels within a PD array

**Risk & Psychology (from ICT's mentorship):**
- "Trade small, trade often" — position sizing discipline
- Focus on pips/points, not dollars
- 1-2% risk per trade maximum
- Revenge trading, overtrading, FOMO — common pitfalls ICT warns about
- Journal every trade — The Chamber exists to enforce this habit

ANALYSIS INSTRUCTIONS

When analyzing a trade:
- Evaluate using ICT concepts with specific feedback
- If the trader scaled in/out, evaluate the strategy
- Identify strengths and areas for improvement
- Rate the trade 1-10

FORMATTING RULES — VERY IMPORTANT:
- DO NOT use markdown headers (no # or ##)
- DO NOT use bold markers (no ** or __)
- Use plain text only with line breaks
- Keep it concise — aim for 300-400 words max
- Use a conversational, mentor-like tone
- Use emojis to make it visually engaging (🔥 ✅ ⚠️ 📊 🎯 💡 etc.) but NEVER use the 💯 emoji

Format your response EXACTLY like this:

ICT Rating: [X]/10

✅ What you did well:
- [short bullet, reference ICT concept]
- [short bullet]

⚠️ What to work on:
- [short bullet with actionable tip]
- [short bullet]

📊 Breakdown:
[2-3 short paragraphs. Cover entry quality, timing, structure, liquidity targets. Be specific to THIS trade, not generic. Keep it tight.]

🎯 Key takeaway:
[One sentence — the most important lesson.]

This is educational analysis based on ICT methodology, not financial advice.

Rules:
- Be direct and mentor-like, not robotic
- Use emojis naturally throughout (not just section headers)
- Reference ICT concepts naturally, don't just list them
- If multiple trades, give a quick take on each then an overall session note
- NEVER use ## or ** in your response — plain text only`;


interface AnalysisRequest {
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

function extractScore(text: string): number | null {
  // Match "ICT Rating: 7/10" or "ICT Rating: 7.5/10" etc.
  const match = text.match(/ICT\s+Rating:\s*([\d.]+)\s*\/\s*10/i);
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

    const body: AnalysisRequest = await req.json();
    const userMessage = buildUserMessage(body);

    // Get user's API key
    const { data: keys } = await supabase
      .from("user_api_keys")
      .select("provider, encrypted_key")
      .eq("user_id", user.id);

    if (!keys || keys.length === 0) {
      return NextResponse.json(
        { error: "No API key configured" },
        { status: 400 }
      );
    }

    // Prefer anthropic, fallback to gemini
    const anthropicKey = keys.find((k) => k.provider === "anthropic");
    const geminiKey = keys.find((k) => k.provider === "gemini");

    let analysisText: string;
    let provider: string;
    let model: string;

    if (anthropicKey) {
      provider = "claude";

      // Try models in order of preference — fallback if model not available on user's plan
      const modelsToTry = [
        "claude-sonnet-4-5-20250929",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-sonnet-20240620",
        "claude-3-haiku-20240307",
      ];

      let lastError = "";
      let success = false;
      analysisText = "";
      model = modelsToTry[0];

      for (const tryModel of modelsToTry) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey.encrypted_key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: tryModel,
            max_tokens: 2048,
            system: ICT_ANALYSIS_SYSTEM_PROMPT,
            messages: [{ role: "user", content: userMessage }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          analysisText = data.content?.[0]?.text || "No response from Claude.";
          model = tryModel;
          success = true;
          break;
        }

        const err = await response.json().catch(() => ({}));
        lastError = err?.error?.message || "Claude API error";

        // Only retry on model-not-found errors, not auth/billing errors
        if (response.status !== 404 && response.status !== 400) {
          return NextResponse.json(
            { error: `Claude API: ${lastError}` },
            { status: response.status }
          );
        }
      }

      if (!success) {
        return NextResponse.json(
          { error: `Claude API: No compatible model found. Last error: ${lastError}` },
          { status: 400 }
        );
      }
    } else if (geminiKey) {
      provider = "gemini";
      model = "gemini-2.0-flash";

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey.encrypted_key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: ICT_ANALYSIS_SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userMessage }],
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return NextResponse.json(
          { error: err?.error?.message || "Gemini API error" },
          { status: response.status }
        );
      }

      const data = await response.json();
      analysisText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "No response from Gemini.";
    } else {
      return NextResponse.json(
        { error: "No supported API key found" },
        { status: 400 }
      );
    }

    // Extract ICT score from the response
    const ictScore = extractScore(analysisText);

    // Save analysis to database
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
      ict_score: ictScore,
      chart_urls: body.chart_urls || null,
    });

    if (insertError) {
      console.error("Failed to save analysis:", insertError);
      // Still return the analysis even if saving fails
    }

    return NextResponse.json({
      analysis: analysisText,
      score: ictScore,
      provider,
      model,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
