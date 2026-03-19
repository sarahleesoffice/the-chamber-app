import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Yahoo Finance quote API route.
 * GET /api/yahoo-quote?symbols=AAPL,MSFT,EURUSD=X
 * Uses curl subprocess to avoid Next.js fetch rate limiting.
 */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// In-memory cache
const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute

export const dynamic = "force-dynamic";

interface QuoteResult {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  prevClose: number;
}

export async function GET(request: NextRequest) {
  const symbols = request.nextUrl.searchParams.get("symbols");
  if (!symbols) {
    return NextResponse.json({ error: "Missing symbols parameter" }, { status: 400 });
  }

  const cacheKey = symbols;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const symbolList = symbols.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
  const quotes: Record<string, QuoteResult> = {};

  for (const symbol of symbolList) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
      const body = execSync(
        `curl -s --max-time 8 -H "User-Agent: ${UA}" "${url}"`,
        { encoding: "utf-8", timeout: 10000 }
      );
      const data = JSON.parse(body);
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        const price = meta.regularMarketPrice ?? 0;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
        const change = price - prevClose;
        const changePct = prevClose ? (change / prevClose) * 100 : 0;
        quotes[symbol] = { symbol, price, change, changePct, prevClose };
      }
    } catch { /* skip symbol */ }
  }

  const responseData = { quotes };
  cache.set(cacheKey, { data: responseData, fetchedAt: Date.now() });

  return NextResponse.json(responseData);
}
