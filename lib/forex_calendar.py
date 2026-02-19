"""
Forex Factory economic calendar fetcher.

Fetches upcoming high-impact events from Forex Factory's calendar XML feed.
Caches results to avoid hitting the server on every page load.
"""

import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import Optional
import urllib.request
import urllib.error

# Simple in-memory cache
_cache: dict = {"data": None, "fetched_at": None}
CACHE_TTL = timedelta(minutes=30)

FOREX_FACTORY_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"


def fetch_calendar(force_refresh: bool = False) -> list[dict]:
    """
    Fetch this week's economic calendar from Forex Factory.

    Returns a list of dicts with keys:
    - title: Event name
    - country: Currency code (USD, EUR, etc.)
    - date: Date string
    - time: Time string (EST)
    - impact: "High", "Medium", "Low", "Holiday"
    - forecast: Forecast value
    - previous: Previous value
    """
    # Check cache
    if not force_refresh and _cache["data"] is not None and _cache["fetched_at"]:
        if datetime.now() - _cache["fetched_at"] < CACHE_TTL:
            return _cache["data"]

    events = []

    try:
        req = urllib.request.Request(
            FOREX_FACTORY_URL,
            headers={"User-Agent": "TheChamber/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()

        root = ET.fromstring(xml_data)

        for event in root.findall(".//event"):
            title = _get_text(event, "title")
            country = _get_text(event, "country")
            date = _get_text(event, "date")
            time = _get_text(event, "time")
            impact = _get_text(event, "impact")
            forecast = _get_text(event, "forecast")
            previous = _get_text(event, "previous")

            events.append({
                "title": title,
                "country": country,
                "date": date,
                "time": time,
                "impact": impact,
                "forecast": forecast,
                "previous": previous,
            })

        _cache["data"] = events
        _cache["fetched_at"] = datetime.now()

    except (urllib.error.URLError, ET.ParseError, Exception):
        # Return cached data if available, or empty list
        if _cache["data"] is not None:
            return _cache["data"]
        return []

    return events


def get_high_impact_events() -> list[dict]:
    """Get only high-impact events."""
    events = fetch_calendar()
    return [e for e in events if e["impact"] == "High"]


def get_events_for_date(date_str: str) -> list[dict]:
    """Get events for a specific date (format: MM-DD-YYYY or similar)."""
    events = fetch_calendar()
    return [e for e in events if date_str in e["date"]]


def get_today_events() -> list[dict]:
    """Get all events for today."""
    events = fetch_calendar()
    today = datetime.now()

    today_events = []
    for e in events:
        try:
            # FF format is like "01-13-2025"
            event_date = datetime.strptime(e["date"], "%m-%d-%Y")
            if event_date.date() == today.date():
                today_events.append(e)
        except ValueError:
            continue

    return today_events


def _get_text(element: ET.Element, tag: str) -> str:
    """Safely get text from an XML element."""
    child = element.find(tag)
    return child.text.strip() if child is not None and child.text else ""
