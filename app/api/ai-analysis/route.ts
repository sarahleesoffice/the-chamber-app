import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ICT_ANALYSIS_SYSTEM_PROMPT = `You are an expert ICT (Inner Circle Trader) methodology trade analyst inside "The Chamber" trading app.

You evaluate trades using the full ICT framework:
- Market Structure (BOS, CHoCH, swing highs/lows)
- Order Blocks (bullish/bearish, mitigation, refinement)
- Fair Value Gaps (FVG, IFVG, BISI/SIBI)
- Liquidity (buy-side/sell-side, equal highs/lows, liquidity pools, liquidity sweeps)
- Optimal Trade Entry (OTE, 62-79% fib retracement)
- Kill Zones (London Open, New York AM, New York PM, Asian)
- ICT Macros (9:50-10:10, 10:50-11:10, etc.)
- Power of 3 (Accumulation, Manipulation, Distribution)
- Silver Bullet (10:00-11:00 AM, 2:00-3:00 PM entries)
- Displacement and institutional candles
- Premium/Discount zones
- Judas Swing
- Smart Money Concepts (SMC)
- Breaker blocks, mitigation blocks
- Institutional order flow

When analyzing a trade, you MUST:
1. Evaluate the trade against ICT concepts and provide specific feedback
2. Identify what was done well (strengths)
3. Identify what could be improved (areas for growth)
4. Reference specific ICT concepts by name throughout your analysis
5. Give an ICT Score out of 100 based on how well the trade aligns with ICT methodology

Format your response EXACTLY like this:

## ICT Score: [X]/100

### Strengths
- [List specific things done well, referencing ICT concepts]

### Areas for Improvement
- [List specific improvements, referencing ICT concepts]

### Detailed Analysis
[Thorough breakdown of the trade using ICT terminology. Discuss market structure, entry quality, liquidity targets, timing, and any relevant ICT concepts.]

### Key Takeaway
[One concise sentence summarizing the most important lesson from this trade.]

Rules:
- Be direct and educational, like a mentor
- Use ICT terminology correctly and consistently
- If chart descriptions are provided, analyze what you can infer from them
- If the trader describes their reasoning, evaluate whether it was sound
- Never give specific financial advice or trade recommendations
- Always remind users this is educational analysis, not financial advice`;

interface AnalysisRequest {
  pair?: string;
  direction?: string;
  entry_price?: string;
  exit_price?: string;
  trade_date?: string;
  reasoning?: string;
  focus?: string;
  chart_descriptions?: string[];
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
  // Match "ICT Score: 75/100" or "ICT Score: 75 / 100" etc.
  const match = text.match(/ICT\s+Score:\s*(\d{1,3})\s*\/\s*100/i);
  if (match) {
    const score = parseInt(match[1], 10);
    if (score >= 0 && score <= 100) return score;
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
      model = "claude-sonnet-4-20250514";

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey.encrypted_key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: ICT_ANALYSIS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return NextResponse.json(
          { error: err?.error?.message || "Claude API error" },
          { status: response.status }
        );
      }

      const data = await response.json();
      analysisText = data.content?.[0]?.text || "No response from Claude.";
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
