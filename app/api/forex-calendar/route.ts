import { NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * Forex Factory economic calendar API route.
 * GET /api/forex-calendar
 *
 * Fetches this week's events from Forex Factory XML feed.
 * NOTE: The FF XML feed delivers times in UTC. We convert to
 * America/New_York (EST/EDT) before returning.
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

/**
 * Convert a UTC time string + date from the FF XML feed to Eastern Time.
 *
 * FF XML date format: MM-DD-YYYY  (e.g. "03-24-2026")
 * FF XML time format: "8:30am" | "1:45pm" | "Tentative" | "All Day" | ""
 *
 * Returns the converted time string in "h:mm AM/PM" format, or the
 * original string unchanged if it can't be parsed (Tentative, All Day, etc.)
 */
function convertUTCtoEST(dateStr: string, timeStr: string): string {
  // Pass through non-time values
  if (!timeStr || timeStr === "" || timeStr.toLowerCase() === "tentative" || timeStr.toLowerCase() === "all day") {
    return timeStr;
  }

  // Parse time: "8:30am", "1:45pm", "12:00pm", "2:00am", etc.
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (!timeMatch) return timeStr; // unknown format, return as-is

  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const meridiem = timeMatch[3].toLowerCase();

  // Convert 12-hour to 24-hour (UTC)
  if (meridiem === "am" && hours === 12) hours = 0;
  if (meridiem === "pm" && hours !== 12) hours += 12;

  // Parse date: MM-DD-YYYY
  const dateParts = dateStr.split("-");
  if (dateParts.length !== 3) return timeStr;
  const [month, day, year] = dateParts;

  // Build a UTC Date object
  const utcDate = new Date(
    Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), hours, minutes, 0)
  );

  if (isNaN(utcDate.getTime())) return timeStr;

  // Convert to America/New_York (handles EST/EDT automatically)
  const estTime = utcDate.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return estTime; // e.g. "9:45 AM"
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

    const rawEvents = parseXML(xml);

    // Convert all times from UTC → America/New_York (EST/EDT)
    const events = rawEvents.map((e) => ({
      ...e,
      time: convertUTCtoEST(e.date, e.time),
    }));

    const responseData = { events, count: events.length, source: "Forex Factory", timezone: "EST" };
    cachedData = responseData;
    cachedAt = Date.now();

    return NextResponse.json(responseData);
  } catch {
    if (cachedData) return NextResponse.json(cachedData);
    return NextResponse.json({ events: [], count: 0, error: "Failed to fetch calendar" }, { status: 500 });
  }
}
