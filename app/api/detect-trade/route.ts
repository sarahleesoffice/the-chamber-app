import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DETECT_SYSTEM_PROMPT = `You are a trading chart image analyzer. Your job is to look at trading chart screenshots and extract trade details.

Look for:
- The trading pair/symbol: usually in the chart title bar, top-left corner, or axis labels (e.g. "EURUSD", "NAS100", "ES", "NQ", "XAUUSD")
- Entry price(s): horizontal lines, markers, or annotations labeled "entry", "buy", "sell", or position lines shown by the broker
- Exit price(s): take-profit lines, stop-loss lines, or annotations labeled "TP", "SL", "exit", "target"
- Direction: "long" if there are buy arrows, green position lines, or upward annotations; "short" if there are sell arrows, red position lines, or downward annotations

Known pairs/symbols to normalize to: EUR/USD, GBP/USD, USD/JPY, USD/CHF, AUD/USD, NZD/USD, USD/CAD, EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY, NZD/JPY, CHF/JPY, XAU/USD, XAG/USD, US100, US30, US500, NAS100, SPX500, DJ30, NQ, ES, YM, BTC/USD, ETH/USD

Return ONLY valid JSON with no other text, no markdown, no code fences:
{"pair":"EUR/USD","direction":"long","entryPrices":["1.08550"],"exitPrices":["1.09200"],"confidence":{"pair":"high","direction":"medium","entryPrices":"high","exitPrices":"low"}}

Rules:
- Use null for fields you cannot detect
- Use empty arrays [] for prices you cannot find
- Confidence levels: "high" (clearly visible/labeled), "medium" (likely but not labeled), "low" (uncertain guess), "none" (not found)
- Prices should be strings with full decimal precision as shown on the chart
- If multiple entry or exit levels are marked, include all of them
- Focus on the most prominent/largest chart if multiple charts are visible`;

interface DetectImage {
  base64: string;
  mediaType: string;
  label: string;
}

interface DetectRequest {
  images: DetectImage[];
}

interface DetectResult {
  pair: string | null;
  direction: "long" | "short" | null;
  entryPrices: string[];
  exitPrices: string[];
  confidence: Record<string, string>;
}

function parseAIResponse(text: string): DetectResult | null {
  // Try direct JSON parse
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code fences
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    // Try finding JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
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

    const body: DetectRequest = await req.json();

    if (!body.images || body.images.length === 0) {
      return NextResponse.json(
        { error: "No images provided" },
        { status: 400 }
      );
    }

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

    const anthropicKey = keys.find((k) => k.provider === "anthropic");
    const geminiKey = keys.find((k) => k.provider === "gemini");

    let responseText = "";
    let provider = "";
    let model = "";

    if (anthropicKey) {
      provider = "claude";

      // Build vision content blocks
      const contentBlocks: Array<Record<string, unknown>> = [];
      for (const img of body.images) {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: img.mediaType,
            data: img.base64,
          },
        });
      }
      contentBlocks.push({
        type: "text",
        text: "Analyze this trading chart and extract trade details. Return ONLY valid JSON.",
      });

      const modelsToTry = [
        "claude-sonnet-4-5-20250929",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-sonnet-20240620",
        "claude-3-haiku-20240307",
      ];

      let lastError = "";
      let success = false;

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
            max_tokens: 1024,
            system: DETECT_SYSTEM_PROMPT,
            messages: [{ role: "user", content: contentBlocks }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          responseText = data.content?.[0]?.text || "";
          model = tryModel;
          success = true;
          break;
        }

        const err = await response.json().catch(() => ({}));
        lastError = err?.error?.message || "Claude API error";

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

      const parts: Array<Record<string, unknown>> = [];
      for (const img of body.images) {
        parts.push({
          inlineData: {
            mimeType: img.mediaType,
            data: img.base64,
          },
        });
      }
      parts.push({
        text: "Analyze this trading chart and extract trade details. Return ONLY valid JSON.",
      });

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey.encrypted_key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: DETECT_SYSTEM_PROMPT }],
            },
            contents: [{ role: "user", parts }],
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
      responseText =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      return NextResponse.json(
        { error: "No supported API key found" },
        { status: 400 }
      );
    }

    // Parse the AI response
    const result = parseAIResponse(responseText);

    if (!result) {
      return NextResponse.json({
        detected: false,
        error: "Could not parse detection results",
        raw: responseText,
        provider,
        model,
      });
    }

    return NextResponse.json({
      detected: true,
      pair: result.pair || null,
      direction: result.direction || null,
      entryPrices: result.entryPrices || [],
      exitPrices: result.exitPrices || [],
      confidence: result.confidence || {},
      provider,
      model,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
