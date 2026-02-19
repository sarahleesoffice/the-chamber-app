import re

COMMON_PAIRS = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF",
    "AUD/USD", "NZD/USD", "USD/CAD",
    "EUR/GBP", "EUR/JPY", "GBP/JPY",
    "AUD/JPY", "CAD/JPY", "CHF/JPY",
    "EUR/AUD", "EUR/CAD", "EUR/NZD",
    "GBP/AUD", "GBP/CAD", "GBP/NZD",
    "AUD/CAD", "AUD/NZD", "NZD/CAD",
    "XAU/USD", "US30", "NAS100", "SPX500",
]

JPY_PAIRS = {"USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY", "CAD/JPY", "CHF/JPY", "NZD/JPY"}

INDEX_PAIRS = {"US30", "NAS100", "SPX500"}


def format_pair(pair: str) -> str:
    pair = pair.strip().upper()
    # Already formatted
    if pair in COMMON_PAIRS:
        return pair
    # Handle formats like "eurusd" or "eur usd"
    cleaned = re.sub(r"[\s/_-]", "", pair)
    if len(cleaned) == 6:
        return f"{cleaned[:3]}/{cleaned[3:]}"
    return pair


def get_pip_multiplier(pair: str) -> float:
    pair = format_pair(pair)
    if pair in JPY_PAIRS:
        return 100.0
    if pair in INDEX_PAIRS:
        return 1.0
    if pair == "XAU/USD":
        return 10.0
    return 10000.0


def calculate_pnl_pips(pair: str, direction: str, entry: float, exit: float) -> float:
    multiplier = get_pip_multiplier(pair)
    if direction == "long":
        return round((exit - entry) * multiplier, 1)
    else:
        return round((entry - exit) * multiplier, 1)


def get_common_pairs() -> list[str]:
    return COMMON_PAIRS.copy()
