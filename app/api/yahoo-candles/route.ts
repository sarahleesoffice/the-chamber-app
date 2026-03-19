import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Yahoo Finance OHLCV candle data API route.
 * Uses curl subprocess to avoid Next.js fetch being rate-limited.
 */

// In-memory cache
const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 15 * 60 * 1000;

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const interval = request.nextUrl.searchParams.get("interval") || "1d";
  const range = request.nextUrl.searchParams.get("range") || "1y";

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol parameter" }, { status: 400 });
  }

  const cacheKey = `${symbol}|${interval}|${range}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;

    // Use curl to avoid Next.js fetch being rate-limited by Yahoo
    const body = execSync(
      `curl -s --max-time 10 -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" "${url}"`,
      { encoding: "utf-8", timeout: 15000 }
    );

    const data = JSON.parse(body);
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: "No data for symbol" }, { status: 404 });
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens: number[] = quote.open || [];
    const highs: number[] = quote.high || [];
    const lows: number[] = quote.low || [];
    const closes: number[] = quote.close || [];
    const vols: number[] = quote.volume || [];

    const meta = result.meta || {};
    const currentPrice = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;

    const candles: Array<{ time: string; open: number; high: number; low: number; close: number }> = [];
    const volumes: Array<{ time: string; value: number; color: string }> = [];
    const seenDates = new Set<string>();

    for (let i = 0; i < timestamps.length; i++) {
      const o = opens[i], h = highs[i], l = lows[i], c = closes[i];
      if (o == null || h == null || l == null || c == null) continue;
      if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;

      const dateStr = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      // Skip duplicate dates — lightweight-charts crashes on dupes
      if (seenDates.has(dateStr)) continue;
      seenDates.add(dateStr);

      candles.push({
        time: dateStr,
        open: Math.round(o * 100000) / 100000,
        high: Math.round(h * 100000) / 100000,
        low: Math.round(l * 100000) / 100000,
        close: Math.round(c * 100000) / 100000,
      });
      volumes.push({
        time: dateStr,
        value: vols[i] || 0,
        color: c >= o ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
      });
    }

    const responseData = {
      candles,
      volumes,
      meta: {
        symbol: meta.symbol || symbol,
        currentPrice,
        prevClose,
        change: currentPrice - prevClose,
        changePct: prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0,
      },
    };

    cache.set(cacheKey, { data: responseData, fetchedAt: Date.now() });
    return NextResponse.json(responseData);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "Failed to fetch data", detail: message.slice(0, 200) }, { status: 502 });
  }
}
