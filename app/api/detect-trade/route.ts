import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderError, generate, pickKey } from "@/lib/ai-providers";
import { getUserApiKeys } from "@/lib/api-keys";

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

    // Get user's API key (decrypted server-side): the provider they chose in
    // Settings, else the first they have
    const key = pickKey(await getUserApiKeys(user.id), user.user_metadata?.ai_provider);
    if (!key) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    const { text: responseText, provider, model } = await generate({
      provider: key.provider,
      apiKey: key.key,
      model: user.user_metadata?.openrouter_model,
      system: DETECT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          text: "Analyze this trading chart and extract trade details. Return ONLY valid JSON.",
          images: body.images.map((img) => ({ base64: img.base64, mediaType: img.mediaType })),
        },
      ],
      maxTokens: 1024,
    });

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
    if (err instanceof AIProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
