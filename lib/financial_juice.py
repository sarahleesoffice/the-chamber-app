"""
Financial Juice live news feed fetcher.

Fetches real-time market news from Financial Juice RSS feed.
Caches results to avoid hitting the server on every page load.
"""

import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Optional
import urllib.request
import urllib.error
import re

# Simple in-memory cache
_cache: dict = {"data": None, "fetched_at": None}
CACHE_TTL = timedelta(minutes=2)  # Short TTL for live news

FINANCIAL_JUICE_RSS = "https://www.financialjuice.com/feed.ashx?xy=rss"

# Category detection patterns
CATEGORY_PATTERNS = {
    "Economic Data": [
        r"Initial Jobless Claims",
        r"Non.?Farm",
        r"NFP",
        r"CPI ",
        r"PPI ",
        r"GDP ",
        r"PMI ",
        r"ISM ",
        r"Retail Sales",
        r"Housing Starts",
        r"Building Permits",
        r"Consumer Confidence",
        r"Durable Goods",
        r"Trade Balance",
        r"Current Account",
        r"Industrial Production",
        r"Capacity Utilization",
        r"Actual .+Forecast",
        r"Bill High Yield",
        r"Unemployment",
    ],
    "Central Banks": [
        r"Fed['s ]",
        r"FOMC",
        r"ECB['s ]",
        r"BOE['s ]",
        r"BOJ['s ]",
        r"RBA['s ]",
        r"rate decision",
        r"interest rate",
        r"hawkish",
        r"dovish",
        r"taper",
        r"QE ",
        r"monetary policy",
        r"Kashkari",
        r"Powell",
        r"Waller",
        r"Bostic",
        r"Goolsbee",
        r"Daly",
        r"Barkin",
        r"Harker",
        r"Williams",
        r"Bowman",
        r"Lagarde",
        r"Bailey",
    ],
    "Commodities": [
        r"Brent",
        r"WTI",
        r"Crude",
        r"Gold ",
        r"Silver ",
        r"Natural Gas",
        r"NYMEX",
        r"COMEX",
        r"Oil ",
        r"copper",
        r"platinum",
        r"palladium",
        r"refinery",
        r"OPEC",
        r"barrel",
        r"/bbl",
    ],
    "Geopolitical": [
        r"Trump",
        r"Biden",
        r"Russia",
        r"Ukraine",
        r"China",
        r"Iran",
        r"NATO",
        r"sanctions",
        r"tariff",
        r"war ",
        r"military",
        r"missile",
        r"strike",
        r"Senate",
        r"Congress",
        r"White House",
        r"ceasefire",
        r"peace talks",
    ],
    "Equities": [
        r"S&P",
        r"Nasdaq",
        r"Dow ",
        r"DJIA",
        r"Russell",
        r"NYSE",
        r"stock",
        r"equity",
        r"earnings",
        r"MOC imbalance",
        r"IPO",
        r"buyback",
    ],
    "Forex": [
        r"EUR/USD",
        r"GBP/USD",
        r"USD/JPY",
        r"AUD/USD",
        r"USD/CAD",
        r"NZD/USD",
        r"USD/CHF",
        r"DXY",
        r"dollar index",
        r"forex",
        r"currency",
    ],
    "Crypto": [
        r"Bitcoin",
        r"BTC",
        r"Ethereum",
        r"ETH",
        r"crypto",
        r"blockchain",
        r"stablecoin",
    ],
}


def _categorize(title: str) -> str:
    """Categorize a news headline based on keyword patterns."""
    for category, patterns in CATEGORY_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, title, re.IGNORECASE):
                return category
    return "Market News"


def _parse_pub_date(date_str: str) -> Optional[datetime]:
    """Parse RSS pubDate format."""
    formats = [
        "%a, %d %b %Y %H:%M:%S GMT",
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _time_ago(dt: datetime) -> str:
    """Return human-readable time ago string."""
    now = datetime.now(timezone.utc)
    diff = now - dt
    seconds = int(diff.total_seconds())

    if seconds < 60:
        return "just now"
    elif seconds < 3600:
        mins = seconds // 60
        return f"{mins}m ago"
    elif seconds < 86400:
        hours = seconds // 3600
        return f"{hours}h ago"
    else:
        days = seconds // 86400
        return f"{days}d ago"


def fetch_news(force_refresh: bool = False) -> list[dict]:
    """
    Fetch live news from Financial Juice RSS feed.

    Returns a list of dicts with keys:
    - title: Headline text
    - link: URL to full article
    - pub_date: datetime object
    - pub_date_str: Formatted date string
    - time_ago: Human-readable time ago
    - category: Auto-detected category
    - guid: Unique ID
    """
    # Check cache
    if not force_refresh and _cache["data"] is not None and _cache["fetched_at"]:
        if datetime.now() - _cache["fetched_at"] < CACHE_TTL:
            return _cache["data"]

    items = []

    try:
        req = urllib.request.Request(
            FINANCIAL_JUICE_RSS,
            headers={"User-Agent": "TheChamber/1.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read()

        root = ET.fromstring(xml_data)

        for item in root.findall(".//item"):
            title_el = item.find("title")
            link_el = item.find("link")
            pub_date_el = item.find("pubDate")
            guid_el = item.find("guid")

            title = title_el.text.strip() if title_el is not None and title_el.text else ""
            link = link_el.text.strip() if link_el is not None and link_el.text else ""
            pub_date_str = pub_date_el.text.strip() if pub_date_el is not None and pub_date_el.text else ""
            guid = guid_el.text.strip() if guid_el is not None and guid_el.text else ""

            if not title:
                continue

            pub_date = _parse_pub_date(pub_date_str)
            category = _categorize(title)

            items.append({
                "title": title,
                "link": link,
                "pub_date": pub_date,
                "pub_date_str": pub_date.strftime("%I:%M %p") if pub_date else "",
                "time_ago": _time_ago(pub_date) if pub_date else "",
                "category": category,
                "guid": guid,
            })

        # Sort by date (newest first)
        items.sort(key=lambda x: x["pub_date"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

        _cache["data"] = items
        _cache["fetched_at"] = datetime.now()

    except (urllib.error.URLError, ET.ParseError, Exception):
        if _cache["data"] is not None:
            return _cache["data"]
        return []

    return items


def get_news_by_category(category: str) -> list[dict]:
    """Get news filtered by category."""
    news = fetch_news()
    return [n for n in news if n["category"] == category]


def get_high_impact_news() -> list[dict]:
    """Get economic data and central bank news (most relevant for trading)."""
    news = fetch_news()
    high_impact = {"Economic Data", "Central Banks"}
    return [n for n in news if n["category"] in high_impact]
