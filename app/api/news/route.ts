import { NextResponse } from "next/server";

/**
 * Financial Juice RSS news feed API route.
 * GET /api/news
 *
 * Fetches from Financial Juice RSS, categorizes headlines, returns JSON.
 */

const FINANCIAL_JUICE_RSS = "https://www.financialjuice.com/feed.ashx?xy=rss";

// Category detection patterns (same as Streamlit version)
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  "Economic Data": [
    /Initial Jobless Claims/i, /Non.?Farm/i, /NFP/i, /CPI /i, /PPI /i,
    /GDP /i, /PMI /i, /ISM /i, /Retail Sales/i, /Housing Starts/i,
    /Building Permits/i, /Consumer Confidence/i, /Durable Goods/i,
    /Trade Balance/i, /Industrial Production/i, /Actual .+Forecast/i,
    /Unemployment/i, /Bill High Yield/i,
  ],
  "Central Banks": [
    /Fed['s ]/i, /FOMC/i, /ECB['s ]/i, /BOE['s ]/i, /BOJ['s ]/i,
    /RBA['s ]/i, /rate decision/i, /interest rate/i, /hawkish/i, /dovish/i,
    /monetary policy/i, /Powell/i, /Waller/i, /Kashkari/i, /Goolsbee/i,
    /Lagarde/i, /Bailey/i, /Bostic/i, /Daly/i, /Barkin/i, /Harker/i,
    /Williams/i, /Bowman/i,
  ],
  "Commodities": [
    /Brent/i, /WTI/i, /Crude/i, /Gold /i, /Silver /i, /Natural Gas/i,
    /NYMEX/i, /COMEX/i, /Oil /i, /copper/i, /OPEC/i, /barrel/i, /\/bbl/i,
  ],
  "Geopolitical": [
    /Trump/i, /Biden/i, /Russia/i, /Ukraine/i, /China/i, /Iran/i,
    /NATO/i, /sanctions/i, /tariff/i, /war /i, /military/i, /missile/i,
    /Senate/i, /Congress/i, /White House/i, /ceasefire/i,
  ],
  "Equities": [
    /S&P/i, /Nasdaq/i, /Dow /i, /DJIA/i, /Russell/i, /NYSE/i,
    /stock/i, /equity/i, /earnings/i, /MOC imbalance/i, /IPO/i,
  ],
  "Forex": [
    /EUR\/USD/i, /GBP\/USD/i, /USD\/JPY/i, /AUD\/USD/i, /USD\/CAD/i,
    /DXY/i, /dollar index/i, /forex/i, /currency/i,
  ],
  "Crypto": [
    /Bitcoin/i, /BTC/i, /Ethereum/i, /ETH/i, /crypto/i, /blockchain/i,
  ],
};

function categorize(title: string): string {
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(title)) return category;
    }
  }
  return "Market News";
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function toEastern(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  pubDateStr: string;
  timeAgo: string;
  category: string;
}

async function fetchRSS(): Promise<NewsItem[]> {
  const res = await fetch(FINANCIAL_JUICE_RSS, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    next: { revalidate: 120 }, // 2 min cache
  });

  if (!res.ok) return [];

  const xml = await res.text();

  // Simple XML parsing for RSS items
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const titleMatch = /<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/s.exec(itemXml);
    const linkMatch = /<link>(.*?)<\/link>/s.exec(itemXml);
    const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/s.exec(itemXml);

    const title = (titleMatch?.[1] || titleMatch?.[2] || "").trim();
    const link = (linkMatch?.[1] || "").trim();
    const pubDateRaw = (pubDateMatch?.[1] || "").trim();

    if (!title) continue;

    const pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const category = categorize(title);

    items.push({
      title,
      link,
      pubDate: pubDate.toISOString(),
      pubDateStr: toEastern(pubDate),
      timeAgo: timeAgo(pubDate.toISOString()),
      category,
    });
  }

  // Sort newest first
  items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

  return items;
}

export async function GET() {
  try {
    const items = await fetchRSS();

    return NextResponse.json({ items, count: items.length, source: "Financial Juice" }, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=30",
      },
    });
  } catch {
    return NextResponse.json({ items: [], count: 0, error: "Failed to fetch news" }, { status: 500 });
  }
}
