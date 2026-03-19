import { NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Forex Factory economic calendar API route.
 * GET /api/forex-calendar
 *
 * Fetches this week's events from Forex Factory XML feed.
 */

const FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml";

// In-memory cache
let cachedData: unknown = null;
let cachedAt = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export const dynamic = "force-dynamic";

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
}

function parseXML(xml: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const eventRegex = /<event>([\s\S]*?)<\/event>/g;
  let match;

  while ((match = eventRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
      if (!m) return "";
      // Strip CDATA wrappers
      return m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
    };

    events.push({
      title: get("title"),
      country: get("country"),
      date: get("date"),
      time: get("time"),
      impact: get("impact"),
      forecast: get("forecast"),
      previous: get("previous"),
    });
  }

  return events;
}

export async function GET() {
  // Check cache
  if (cachedData && Date.now() - cachedAt < CACHE_TTL) {
    return NextResponse.json(cachedData);
  }

  try {
    const xml = execSync(
      `curl -s --max-time 10 -H "User-Agent: TheChamber/1.0" "${FF_URL}"`,
      { encoding: "utf-8", timeout: 15000 }
    );

    const events = parseXML(xml);

    const responseData = { events, count: events.length, source: "Forex Factory" };
    cachedData = responseData;
    cachedAt = Date.now();

    return NextResponse.json(responseData);
  } catch {
    if (cachedData) return NextResponse.json(cachedData);
    return NextResponse.json({ events: [], count: 0, error: "Failed to fetch calendar" }, { status: 500 });
  }
}
