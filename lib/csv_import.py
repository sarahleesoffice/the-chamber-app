"""
Broker CSV import — parse trade history from MT4, MT5, Tradovate, and generic CSV formats.

Supports:
- MetaTrader 4 detailed statement (HTML table export)
- MetaTrader 5 CSV export
- Tradovate Orders CSV export
- Generic CSV with configurable column mapping
"""

import csv
import io
import re
from datetime import datetime
from typing import Optional

from lib.models import Trade


# --- MT4 Parser ---

def parse_mt4_csv(text: str) -> list[Trade]:
    """
    Parse MetaTrader 4 account statement CSV/TSV.

    MT4 exports have columns like:
    Ticket, Open Time, Type, Size, Item, Price, S/L, T/P, Close Time, Price, Commission, Taxes, Swap, Profit
    """
    trades = []
    reader = csv.reader(io.StringIO(text), delimiter="\t")
    rows = list(reader)

    # If tab-delimited doesn't work, try comma
    if rows and len(rows[0]) <= 1:
        reader = csv.reader(io.StringIO(text), delimiter=",")
        rows = list(reader)

    if not rows:
        return []

    # Find header row
    header_idx = None
    for i, row in enumerate(rows):
        row_lower = [c.strip().lower() for c in row]
        if "ticket" in row_lower and ("type" in row_lower or "item" in row_lower):
            header_idx = i
            break

    if header_idx is None:
        return []

    headers = [c.strip().lower() for c in rows[header_idx]]

    # Map columns
    col_map = {}
    for i, h in enumerate(headers):
        if "ticket" in h:
            col_map["ticket"] = i
        elif h == "type":
            col_map["type"] = i
        elif "item" in h or "symbol" in h:
            col_map["symbol"] = i
        elif "open time" in h:
            col_map["open_time"] = i
        elif "close time" in h:
            col_map["close_time"] = i
        elif h == "profit":
            col_map["profit"] = i
        elif h == "size" or h == "volume":
            col_map["size"] = i

    # Find both price columns (open price and close price)
    price_cols = [i for i, h in enumerate(headers) if h == "price"]

    for row in rows[header_idx + 1 :]:
        if len(row) <= max(col_map.values(), default=0):
            continue

        trade_type = row[col_map.get("type", 0)].strip().lower() if "type" in col_map else ""

        # Only process buy/sell trades
        if trade_type not in ("buy", "sell"):
            continue

        try:
            symbol = row[col_map.get("symbol", 0)].strip()
            direction = "long" if trade_type == "buy" else "short"

            entry_price = float(row[price_cols[0]]) if len(price_cols) >= 1 else 0.0
            exit_price = float(row[price_cols[1]]) if len(price_cols) >= 2 else 0.0

            profit = float(row[col_map.get("profit", 0)]) if "profit" in col_map else 0.0

            # Calculate pips
            pips = _calculate_pips(symbol, direction, entry_price, exit_price)

            # Parse close time for trade date
            close_time_str = row[col_map.get("close_time", col_map.get("open_time", 0))].strip()
            trade_date = _parse_date(close_time_str)

            trades.append(Trade(
                pair=_normalize_pair(symbol),
                direction=direction,
                entry_price=entry_price,
                exit_price=exit_price,
                pnl_pips=pips,
                pnl_dollar=profit,
                trade_date=trade_date,
                reasoning=f"Imported from MT4 (ticket #{row[col_map.get('ticket', 0)].strip()})",
            ))
        except (ValueError, IndexError):
            continue

    return trades


# --- MT5 Parser ---

def parse_mt5_csv(text: str) -> list[Trade]:
    """
    Parse MetaTrader 5 CSV export.

    Supports two common MT5 export formats:

    Format A (Deal history):
    Time, Deal, Symbol, Type, Direction, Volume, Price, Order, Commission, Fee, Swap, Profit, Balance, Comment

    Format B (Trade history — common from MT5 mobile/desktop):
    Ticket, Open, Type, Volume, Symbol, Price, SL, TP, Close, Price, Swap, Commissions, Profit, Pips, Trade duration
    """
    trades = []
    reader = csv.reader(io.StringIO(text), delimiter="\t")
    rows = list(reader)

    if rows and len(rows[0]) <= 1:
        reader = csv.reader(io.StringIO(text), delimiter=",")
        rows = list(reader)

    if not rows:
        return []

    # Find header row — support both format A and B
    header_idx = None
    for i, row in enumerate(rows):
        row_lower = [c.strip().lower() for c in row]
        # Format A: deal-based
        if "symbol" in row_lower and ("deal" in row_lower or "order" in row_lower):
            header_idx = i
            break
        # Format B: ticket-based with open/close times
        if "ticket" in row_lower and "symbol" in row_lower and "type" in row_lower:
            header_idx = i
            break

    if header_idx is None:
        return []

    headers = [c.strip().lower() for c in rows[header_idx]]

    # Detect which format we have
    has_ticket = "ticket" in headers
    has_open_close = "open" in headers and "close" in headers

    if has_ticket and has_open_close:
        # Format B: Ticket, Open, Type, Volume, Symbol, Price, SL, TP, Close, Price, ...
        return _parse_mt5_trade_history(rows, header_idx, headers)
    else:
        # Format A: Deal-based format
        return _parse_mt5_deal_history(rows, header_idx, headers)


def _parse_mt5_trade_history(rows, header_idx, headers) -> list[Trade]:
    """
    Parse MT5 trade history format:
    Ticket, Open, Type, Volume, Symbol, Price, SL, TP, Close, Price, Swap, Commissions, Profit, Pips, Trade duration

    This format has TWO 'Price' columns — entry price and exit price.
    """
    trades = []

    col = {}
    price_cols = []  # Track both Price columns
    for i, h in enumerate(headers):
        if h == "ticket":
            col["ticket"] = i
        elif h == "open":
            col["open"] = i
        elif h == "type":
            col["type"] = i
        elif h == "volume":
            col["volume"] = i
        elif h == "symbol":
            col["symbol"] = i
        elif h == "price":
            price_cols.append(i)
        elif h == "sl" or h == "s/l":
            col["sl"] = i
        elif h == "tp" or h == "t/p":
            col["tp"] = i
        elif h == "close":
            col["close"] = i
        elif h == "swap":
            col["swap"] = i
        elif h in ("commissions", "commission"):
            col["commission"] = i
        elif h == "profit":
            col["profit"] = i
        elif h == "pips":
            col["pips"] = i
        elif h == "trade duration":
            col["duration"] = i

    for row in rows[header_idx + 1:]:
        if not row or all(c.strip() == "" for c in row):
            continue
        # Stop if we hit a summary row
        first_cell = row[0].strip().lower() if row else ""
        if first_cell in ("", "total", "summary", "balance"):
            # Only skip if it looks like a summary — empty ticket with data elsewhere
            if "ticket" in col and (not row[col["ticket"]].strip() or not row[col["ticket"]].strip().isdigit()):
                continue

        try:
            trade_type = row[col.get("type", 0)].strip().lower() if "type" in col else ""

            if "buy" in trade_type:
                direction = "long"
            elif "sell" in trade_type:
                direction = "short"
            else:
                continue

            symbol = row[col.get("symbol", 0)].strip() if "symbol" in col else ""
            if not symbol:
                continue

            # Entry price = first Price column, Exit price = second Price column
            entry_price = float(row[price_cols[0]]) if len(price_cols) >= 1 else 0.0
            exit_price = float(row[price_cols[1]]) if len(price_cols) >= 2 else entry_price

            profit = 0.0
            if "profit" in col:
                profit_str = row[col["profit"]].strip().replace(" ", "")
                if profit_str:
                    profit = float(profit_str)

            # Read volume/lot size (number of contracts)
            volume = 1.0
            if "volume" in col:
                vol_str = row[col["volume"]].strip().replace(" ", "")
                if vol_str:
                    try:
                        volume = float(vol_str)
                    except ValueError:
                        volume = 1.0
            if volume <= 0:
                volume = 1.0

            # Use the Pips column if available, then multiply by volume
            pips = 0.0
            if "pips" in col:
                pips_str = row[col["pips"]].strip().replace(" ", "")
                if pips_str:
                    try:
                        pips = float(pips_str)
                    except ValueError:
                        pips = _calculate_pips(symbol, direction, entry_price, exit_price)
            else:
                pips = _calculate_pips(symbol, direction, entry_price, exit_price)

            # Multiply pips by volume (e.g. 10 pips × 10 contracts = 100 pips)
            pips = pips * volume

            # Parse close time for trade date (prefer close, fallback to open)
            trade_date = ""
            if "close" in col:
                close_str = row[col["close"]].strip()
                if close_str:
                    trade_date = _parse_date(close_str)
            if not trade_date and "open" in col:
                open_str = row[col["open"]].strip()
                if open_str:
                    trade_date = _parse_date(open_str)

            ticket = row[col.get("ticket", 0)].strip() if "ticket" in col else ""

            trades.append(Trade(
                pair=_normalize_pair(symbol),
                direction=direction,
                entry_price=entry_price,
                exit_price=exit_price,
                pnl_pips=pips,
                pnl_dollar=profit,
                trade_date=trade_date,
                reasoning=f"Imported from MT5 (ticket #{ticket})" if ticket else "Imported from MT5",
            ))
        except (ValueError, IndexError):
            continue

    return trades


def _parse_mt5_deal_history(rows, header_idx, headers) -> list[Trade]:
    """
    Parse MT5 deal history format:
    Time, Deal, Symbol, Type, Direction, Volume, Price, Order, Commission, Fee, Swap, Profit, Balance, Comment
    """
    trades = []

    col = {}
    for i, h in enumerate(headers):
        if h == "time":
            col["time"] = i
        elif h == "deal" or h == "order":
            col.setdefault("deal", i)
        elif h == "symbol":
            col["symbol"] = i
        elif h == "type":
            col["type"] = i
        elif h == "direction":
            col["direction"] = i
        elif h == "price":
            col.setdefault("price", i)
        elif h == "profit":
            col["profit"] = i
        elif h == "volume":
            col["volume"] = i

    for row in rows[header_idx + 1 :]:
        if len(row) <= max(col.values(), default=0):
            continue

        try:
            trade_type = row[col.get("type", 0)].strip().lower()
            direction_str = row[col.get("direction", col.get("type", 0))].strip().lower()

            # MT5 "deal" types: buy/sell for entries, or in/out for direction
            if "buy" in trade_type or "buy" in direction_str:
                direction = "long"
            elif "sell" in trade_type or "sell" in direction_str:
                direction = "short"
            else:
                continue

            symbol = row[col.get("symbol", 0)].strip()
            if not symbol:
                continue

            price = float(row[col.get("price", 0)])
            profit = float(row[col.get("profit", 0)]) if "profit" in col else 0.0

            time_str = row[col.get("time", 0)].strip()
            trade_date = _parse_date(time_str)

            trades.append(Trade(
                pair=_normalize_pair(symbol),
                direction=direction,
                entry_price=price,
                exit_price=price,  # Will be merged later
                pnl_pips=0.0,
                pnl_dollar=profit,
                trade_date=trade_date,
                reasoning=f"Imported from MT5",
            ))
        except (ValueError, IndexError):
            continue

    return trades


# --- Tradovate Parser ---

def parse_tradovate_csv(text: str) -> list[Trade]:
    """
    Parse Tradovate Orders CSV export.

    Tradovate exports orders (not matched trades), so we pair
    buy fills with sell fills per contract to create round-trip trades.

    Expected columns include:
    B/S, Product, Avg Fill Price / avgPrice, Fill Time / Date,
    Filled Qty / filledQty, Contract, Status
    """
    trades = []
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    if not rows:
        return []

    # Find header row
    header_idx = None
    for i, row in enumerate(rows):
        row_lower = [c.strip().lower() for c in row]
        if any("b/s" in h or "b / s" in h for h in row_lower):
            header_idx = i
            break

    if header_idx is None:
        return []

    headers = [c.strip().lower() for c in rows[header_idx]]

    # Map columns
    col = {}
    for i, h in enumerate(headers):
        if h in ("b/s", "b / s", "side"):
            col["side"] = i
        elif h == "product":
            col["product"] = i
        elif h == "contract":
            col["contract"] = i
        elif h in ("avg fill price", "avgprice", "avg price"):
            col["price"] = i
        elif h in ("fill time", "filltime"):
            col["fill_time"] = i
        elif h == "date":
            col.setdefault("date", i)
        elif h in ("filled qty", "filledqty", "quantity", "qty"):
            col.setdefault("qty", i)
        elif h == "status":
            col["status"] = i
        elif h in ("orderid", "order id"):
            col.setdefault("order_id", i)

    if "side" not in col:
        return []

    # Parse all filled orders
    orders = []
    for row in rows[header_idx + 1:]:
        if len(row) <= max(col.values(), default=0):
            continue

        try:
            side = row[col["side"]].strip().upper()
            if side not in ("BUY", "SELL", "B", "S"):
                continue

            # Check status if available
            if "status" in col:
                status = row[col["status"]].strip().lower()
                if status not in ("filled", "completed", ""):
                    continue

            product = row[col.get("product", col.get("contract", 0))].strip()
            if not product:
                continue

            price = float(row[col.get("price", 0)])
            qty = int(float(row[col.get("qty", 0)])) if "qty" in col else 1

            # Get date
            date_str = ""
            if "fill_time" in col:
                date_str = row[col["fill_time"]].strip()
            elif "date" in col:
                date_str = row[col["date"]].strip()

            trade_date = _parse_date(date_str) if date_str else ""

            is_buy = side in ("BUY", "B")
            order_id = row[col["order_id"]].strip() if "order_id" in col else ""

            orders.append({
                "side": "buy" if is_buy else "sell",
                "product": product,
                "price": price,
                "qty": qty,
                "date": trade_date,
                "order_id": order_id,
            })
        except (ValueError, IndexError):
            continue

    # Match buy/sell orders into round-trip trades per product
    # Group by product
    product_orders: dict[str, list[dict]] = {}
    for order in orders:
        p = order["product"]
        if p not in product_orders:
            product_orders[p] = []
        product_orders[p].append(order)

    for product, prod_orders in product_orders.items():
        buys = [o for o in prod_orders if o["side"] == "buy"]
        sells = [o for o in prod_orders if o["side"] == "sell"]

        # Pair them in chronological order (FIFO)
        pairs_count = min(len(buys), len(sells))

        for i in range(pairs_count):
            buy = buys[i]
            sell = sells[i]

            # Determine which is entry and which is exit based on time
            entry = buy
            exit_o = sell
            direction = "long"

            # If sell came first, it's a short
            if sell["date"] < buy["date"]:
                entry = sell
                exit_o = buy
                direction = "short"

            symbol = _normalize_tradovate_symbol(product)
            pips = _calculate_pips(symbol, direction, entry["price"], exit_o["price"])

            trades.append(Trade(
                pair=symbol,
                direction=direction,
                entry_price=entry["price"],
                exit_price=exit_o["price"],
                pnl_pips=pips,
                pnl_dollar=None,
                trade_date=exit_o["date"] or entry["date"],
                reasoning=f"Imported from Tradovate ({product})",
            ))

    return trades


def _normalize_tradovate_symbol(product: str) -> str:
    """Convert Tradovate product codes to readable names."""
    product = product.strip().upper()

    # Remove contract month/year suffix (e.g., ESH5 -> ES, NQM5 -> NQ)
    clean = re.sub(r"[FGHJKMNQUVXZ]\d{1,2}$", "", product)

    TRADOVATE_MAP = {
        "ES": "ES (S&P 500)",
        "MES": "MES (Micro S&P)",
        "NQ": "NQ (Nasdaq)",
        "MNQ": "MNQ (Micro Nasdaq)",
        "YM": "YM (Dow)",
        "MYM": "MYM (Micro Dow)",
        "RTY": "RTY (Russell)",
        "M2K": "M2K (Micro Russell)",
        "CL": "CL (Crude Oil)",
        "MCL": "MCL (Micro Crude)",
        "GC": "GC (Gold)",
        "MGC": "MGC (Micro Gold)",
        "SI": "SI (Silver)",
        "ZB": "ZB (30yr Bond)",
        "ZN": "ZN (10yr Note)",
        "ZF": "ZF (5yr Note)",
        "6E": "6E (EUR/USD)",
        "6B": "6B (GBP/USD)",
        "6J": "6J (USD/JPY)",
        "6A": "6A (AUD/USD)",
        "6C": "6C (USD/CAD)",
        "NG": "NG (Natural Gas)",
        "HE": "HE (Lean Hogs)",
        "LE": "LE (Live Cattle)",
        "ZC": "ZC (Corn)",
        "ZS": "ZS (Soybeans)",
        "ZW": "ZW (Wheat)",
    }

    return TRADOVATE_MAP.get(clean, clean or product)


# --- Generic CSV Parser ---

def parse_generic_csv(
    text: str,
    pair_col: str = "pair",
    direction_col: str = "direction",
    entry_col: str = "entry_price",
    exit_col: str = "exit_price",
    pnl_col: str = "pnl_pips",
    dollar_col: str = "pnl_dollar",
    date_col: str = "trade_date",
    notes_col: str = "reasoning",
) -> list[Trade]:
    """
    Parse a generic CSV with configurable column names.

    At minimum needs: pair, direction, entry_price, exit_price, trade_date.
    """
    trades = []
    reader = csv.DictReader(io.StringIO(text))

    for row in reader:
        try:
            pair = row.get(pair_col, "").strip()
            direction = row.get(direction_col, "").strip().lower()
            if direction not in ("long", "short", "buy", "sell"):
                continue
            if direction == "buy":
                direction = "long"
            elif direction == "sell":
                direction = "short"

            entry = float(row.get(entry_col, 0))
            exit_p = float(row.get(exit_col, 0))

            pnl_pips = float(row.get(pnl_col, 0)) if pnl_col in row else _calculate_pips(pair, direction, entry, exit_p)
            pnl_dollar = float(row.get(dollar_col, 0)) if dollar_col in row and row.get(dollar_col) else None

            trade_date = row.get(date_col, "").strip()
            if trade_date:
                trade_date = _parse_date(trade_date)

            reasoning = row.get(notes_col, "").strip() if notes_col in row else "Imported from CSV"

            if pair and entry and exit_p and trade_date:
                trades.append(Trade(
                    pair=_normalize_pair(pair),
                    direction=direction,
                    entry_price=entry,
                    exit_price=exit_p,
                    pnl_pips=pnl_pips,
                    pnl_dollar=pnl_dollar,
                    trade_date=trade_date,
                    reasoning=reasoning or "Imported from CSV",
                ))
        except (ValueError, KeyError):
            continue

    return trades


# --- Auto-detect format ---

def detect_and_parse(text: str) -> tuple[str, list[Trade]]:
    """
    Auto-detect CSV format and parse trades.

    Returns (format_name, trades).
    """
    text_lower = text[:2000].lower()

    # MT4 detection (uses "open time" / "close time" specifically)
    if "ticket" in text_lower and ("open time" in text_lower or "close time" in text_lower):
        return "MT4", parse_mt4_csv(text)

    # MT5 detection — format A (deal history)
    if "deal" in text_lower and "symbol" in text_lower and ("direction" in text_lower or "commission" in text_lower):
        return "MT5", parse_mt5_csv(text)

    # MT5 detection — format B (trade history: Ticket, Open, Type, Symbol, Price, Close, Price, Profit, Pips)
    if "ticket" in text_lower and "symbol" in text_lower and "type" in text_lower and ("profit" in text_lower or "pips" in text_lower):
        trades = parse_mt5_csv(text)
        if trades:
            return "MT5", trades

    # Tradovate detection
    if any(marker in text_lower for marker in ("b/s", "b / s")) and ("product" in text_lower or "contract" in text_lower):
        return "Tradovate", parse_tradovate_csv(text)

    # Generic CSV fallback
    reader = csv.reader(io.StringIO(text))
    try:
        headers = [h.strip().lower() for h in next(reader)]
    except StopIteration:
        return "Unknown", []

    # Check for common column names
    has_pair = any(h in headers for h in ["pair", "symbol", "instrument", "item"])
    has_direction = any(h in headers for h in ["direction", "type", "side", "action"])
    has_entry = any(h in headers for h in ["entry_price", "entry", "open_price", "open", "price"])
    has_exit = any(h in headers for h in ["exit_price", "exit", "close_price", "close"])

    if has_pair and has_direction and (has_entry or has_exit):
        # Map to the actual column names found
        col_mapping = {}
        for h in headers:
            if h in ("pair", "symbol", "instrument", "item"):
                col_mapping["pair_col"] = h
            elif h in ("direction", "type", "side", "action"):
                col_mapping["direction_col"] = h
            elif h in ("entry_price", "entry", "open_price", "open"):
                col_mapping["entry_col"] = h
            elif h in ("exit_price", "exit", "close_price", "close"):
                col_mapping["exit_col"] = h
            elif h in ("pnl_pips", "pips", "pnl"):
                col_mapping["pnl_col"] = h
            elif h in ("pnl_dollar", "profit", "pnl_usd", "dollar"):
                col_mapping["dollar_col"] = h
            elif h in ("trade_date", "date", "close_time", "close_date"):
                col_mapping["date_col"] = h
            elif h in ("reasoning", "notes", "comment", "reason"):
                col_mapping["notes_col"] = h

        return "Generic CSV", parse_generic_csv(text, **col_mapping)

    return "Unknown", []


# --- Helpers ---

def _normalize_pair(symbol: str) -> str:
    """Normalize symbol name to standard pair format."""
    symbol = symbol.strip().upper()
    # Remove common suffixes
    for suffix in (".i", ".raw", ".pro", ".m", ".z", "_SB", "micro", ".ecn"):
        symbol = symbol.replace(suffix.upper(), "")

    # Add slash if it looks like a forex pair (6 chars, no slash)
    if len(symbol) == 6 and symbol.isalpha():
        symbol = f"{symbol[:3]}/{symbol[3:]}"

    return symbol


def _calculate_pips(symbol: str, direction: str, entry: float, exit_p: float) -> float:
    """Calculate pips from entry/exit prices."""
    symbol_upper = symbol.upper().replace("/", "")

    if entry == 0 or exit_p == 0:
        return 0.0

    raw_diff = exit_p - entry if direction == "long" else entry - exit_p

    # JPY pairs
    if "JPY" in symbol_upper:
        return round(raw_diff * 100, 1)
    # Indices
    elif any(idx in symbol_upper for idx in ("NAS", "US30", "SPX", "US500", "DAX", "USTEC")):
        return round(raw_diff, 1)
    # Gold
    elif "XAU" in symbol_upper:
        return round(raw_diff * 10, 1)
    # Standard forex
    else:
        return round(raw_diff * 10000, 1)


def _parse_date(date_str: str) -> str:
    """Parse various date formats to YYYY-MM-DD."""
    date_str = date_str.strip()

    formats = [
        "%Y.%m.%d %H:%M:%S",
        "%Y.%m.%d %H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
        "%Y.%m.%d",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Last resort — try to extract just a date pattern
    match = re.search(r"(\d{4})[.\-/](\d{2})[.\-/](\d{2})", date_str)
    if match:
        return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    return date_str  # Return as-is if nothing works
