from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Trade:
    id: Optional[int] = None
    pair: str = ""
    direction: str = ""  # "long" or "short"
    entry_price: float = 0.0
    exit_price: float = 0.0
    pnl_pips: float = 0.0
    pnl_dollar: Optional[float] = None
    trade_date: str = ""
    reasoning: str = ""
    chart_path: Optional[str] = None
    created_at: str = ""


@dataclass
class Analysis:
    id: Optional[int] = None
    trade_id: int = 0
    provider: str = ""
    model: str = ""
    analysis_text: str = ""
    created_at: str = ""


@dataclass
class DailyJournal:
    id: Optional[int] = None
    journal_date: str = ""  # YYYY-MM-DD, unique per day
    # Mental state scores (1-10)
    sleep: int = 5
    energy: int = 5
    focus: int = 5
    mood: int = 5
    stress: int = 5
    confidence: int = 5
    readiness_score: int = 5
    readiness_label: str = ""
    # Selections (stored as comma-separated strings)
    emotional_states: str = ""       # e.g. "Calm,Focused,Patient"
    ict_setups_used: str = ""        # e.g. "Order Block Entry,FVG Fill"
    market_condition: str = ""       # e.g. "Trending (Strong)"
    mistakes: str = ""               # e.g. "Chased entry,Overtraded"
    # Text fields
    reflection: str = ""
    lessons_learned: str = ""
    tomorrows_improvements: str = ""
    created_at: str = ""
    updated_at: str = ""


@dataclass
class PlaybookSetup:
    id: Optional[int] = None
    name: str = ""                   # e.g. "London OB + FVG"
    setup_type: str = ""             # e.g. "Order Block Entry"
    rules: str = ""                  # Comma-separated rules
    description: str = ""            # Freeform description
    active: bool = True
    created_at: str = ""


@dataclass
class TradeGrade:
    id: Optional[int] = None
    trade_id: int = 0
    playbook_id: int = 0
    rules_followed: str = ""         # Comma-separated rules that were followed
    rules_broken: str = ""           # Comma-separated rules that were broken
    compliance_pct: float = 0.0
    notes: str = ""
    created_at: str = ""


@dataclass
class WatchlistItem:
    id: Optional[int] = None
    pair: str = ""                   # e.g. "NAS100", "EUR/USD"
    bias: str = ""                   # "bullish", "bearish", "neutral"
    timeframe: str = ""              # e.g. "4H", "1H", "15m"
    key_levels: str = ""             # Comma-separated key levels
    notes: str = ""                  # Trade plan / reasoning
    setup_type: str = ""             # ICT setup being watched for
    alert_price: Optional[float] = None  # Price level to watch
    active: bool = True
    created_at: str = ""
    updated_at: str = ""
