import os
import sqlite3
from typing import Optional

from lib.models import Trade, Analysis, DailyJournal, PlaybookSetup, TradeGrade, WatchlistItem

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "trades.db")


def get_connection() -> sqlite3.Connection:
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_connection()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pair TEXT NOT NULL,
                direction TEXT NOT NULL CHECK(direction IN ('long', 'short')),
                entry_price REAL NOT NULL,
                exit_price REAL NOT NULL,
                pnl_pips REAL NOT NULL,
                pnl_dollar REAL,
                trade_date TEXT NOT NULL,
                reasoning TEXT DEFAULT '',
                chart_path TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                analysis_text TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS daily_journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                journal_date TEXT NOT NULL UNIQUE,
                sleep INTEGER NOT NULL DEFAULT 5,
                energy INTEGER NOT NULL DEFAULT 5,
                focus INTEGER NOT NULL DEFAULT 5,
                mood INTEGER NOT NULL DEFAULT 5,
                stress INTEGER NOT NULL DEFAULT 5,
                confidence INTEGER NOT NULL DEFAULT 5,
                readiness_score INTEGER NOT NULL DEFAULT 5,
                readiness_label TEXT DEFAULT '',
                emotional_states TEXT DEFAULT '',
                ict_setups_used TEXT DEFAULT '',
                market_condition TEXT DEFAULT '',
                mistakes TEXT DEFAULT '',
                reflection TEXT DEFAULT '',
                lessons_learned TEXT DEFAULT '',
                tomorrows_improvements TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS playbook_setups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                setup_type TEXT NOT NULL,
                rules TEXT NOT NULL DEFAULT '',
                description TEXT DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS trade_grades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                trade_id INTEGER NOT NULL,
                playbook_id INTEGER NOT NULL,
                rules_followed TEXT DEFAULT '',
                rules_broken TEXT DEFAULT '',
                compliance_pct REAL NOT NULL DEFAULT 0,
                notes TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
                FOREIGN KEY (playbook_id) REFERENCES playbook_setups(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pair TEXT NOT NULL,
                bias TEXT NOT NULL DEFAULT 'neutral',
                timeframe TEXT DEFAULT '',
                key_levels TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                setup_type TEXT DEFAULT '',
                alert_price REAL,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
    conn.close()


def _row_to_trade(row: sqlite3.Row) -> Trade:
    return Trade(
        id=row["id"],
        pair=row["pair"],
        direction=row["direction"],
        entry_price=row["entry_price"],
        exit_price=row["exit_price"],
        pnl_pips=row["pnl_pips"],
        pnl_dollar=row["pnl_dollar"],
        trade_date=row["trade_date"],
        reasoning=row["reasoning"],
        chart_path=row["chart_path"],
        created_at=row["created_at"],
    )


def _row_to_analysis(row: sqlite3.Row) -> Analysis:
    return Analysis(
        id=row["id"],
        trade_id=row["trade_id"],
        provider=row["provider"],
        model=row["model"],
        analysis_text=row["analysis_text"],
        created_at=row["created_at"],
    )


def insert_trade(trade: Trade) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO trades (pair, direction, entry_price, exit_price, pnl_pips, pnl_dollar, trade_date, reasoning, chart_path)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (trade.pair, trade.direction, trade.entry_price, trade.exit_price,
             trade.pnl_pips, trade.pnl_dollar, trade.trade_date, trade.reasoning, trade.chart_path),
        )
        trade_id = cursor.lastrowid
    conn.close()
    return trade_id


def get_trade(trade_id: int) -> Optional[Trade]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM trades WHERE id = ?", (trade_id,)).fetchone()
    conn.close()
    return _row_to_trade(row) if row else None


def get_all_trades(limit: int = 50, offset: int = 0) -> list[Trade]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades ORDER BY trade_date DESC, id DESC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


def get_trades_by_pair(pair: str) -> list[Trade]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades WHERE pair = ? ORDER BY trade_date DESC", (pair,)
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


def get_distinct_pairs() -> list[str]:
    conn = get_connection()
    rows = conn.execute("SELECT DISTINCT pair FROM trades ORDER BY pair").fetchall()
    conn.close()
    return [r["pair"] for r in rows]


def get_trade_count() -> int:
    conn = get_connection()
    row = conn.execute("SELECT COUNT(*) as cnt FROM trades").fetchone()
    conn.close()
    return row["cnt"]


def delete_trade(trade_id: int) -> None:
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM trades WHERE id = ?", (trade_id,))
    conn.close()


def insert_analysis(analysis: Analysis) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO analyses (trade_id, provider, model, analysis_text)
               VALUES (?, ?, ?, ?)""",
            (analysis.trade_id, analysis.provider, analysis.model, analysis.analysis_text),
        )
        analysis_id = cursor.lastrowid
    conn.close()
    return analysis_id


def get_analyses_for_trade(trade_id: int) -> list[Analysis]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM analyses WHERE trade_id = ? ORDER BY created_at DESC",
        (trade_id,),
    ).fetchall()
    conn.close()
    return [_row_to_analysis(r) for r in rows]


# --- Daily Journal ---

def _row_to_journal(row: sqlite3.Row) -> DailyJournal:
    return DailyJournal(
        id=row["id"],
        journal_date=row["journal_date"],
        sleep=row["sleep"],
        energy=row["energy"],
        focus=row["focus"],
        mood=row["mood"],
        stress=row["stress"],
        confidence=row["confidence"],
        readiness_score=row["readiness_score"],
        readiness_label=row["readiness_label"],
        emotional_states=row["emotional_states"],
        ict_setups_used=row["ict_setups_used"],
        market_condition=row["market_condition"],
        mistakes=row["mistakes"],
        reflection=row["reflection"],
        lessons_learned=row["lessons_learned"],
        tomorrows_improvements=row["tomorrows_improvements"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def upsert_journal(journal: DailyJournal) -> int:
    """Insert or update a daily journal entry (one per date)."""
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO daily_journal
               (journal_date, sleep, energy, focus, mood, stress, confidence,
                readiness_score, readiness_label, emotional_states, ict_setups_used,
                market_condition, mistakes, reflection, lessons_learned,
                tomorrows_improvements)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(journal_date) DO UPDATE SET
                sleep=excluded.sleep, energy=excluded.energy, focus=excluded.focus,
                mood=excluded.mood, stress=excluded.stress, confidence=excluded.confidence,
                readiness_score=excluded.readiness_score, readiness_label=excluded.readiness_label,
                emotional_states=excluded.emotional_states, ict_setups_used=excluded.ict_setups_used,
                market_condition=excluded.market_condition, mistakes=excluded.mistakes,
                reflection=excluded.reflection, lessons_learned=excluded.lessons_learned,
                tomorrows_improvements=excluded.tomorrows_improvements,
                updated_at=datetime('now')""",
            (journal.journal_date, journal.sleep, journal.energy, journal.focus,
             journal.mood, journal.stress, journal.confidence,
             journal.readiness_score, journal.readiness_label,
             journal.emotional_states, journal.ict_setups_used,
             journal.market_condition, journal.mistakes,
             journal.reflection, journal.lessons_learned,
             journal.tomorrows_improvements),
        )
        journal_id = cursor.lastrowid
    conn.close()
    return journal_id


def get_journal(journal_date: str) -> Optional[DailyJournal]:
    """Get journal entry for a specific date (YYYY-MM-DD)."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM daily_journal WHERE journal_date = ?", (journal_date,)
    ).fetchone()
    conn.close()
    return _row_to_journal(row) if row else None


def get_journal_dates() -> list[str]:
    """Get all dates that have journal entries."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT journal_date FROM daily_journal ORDER BY journal_date DESC"
    ).fetchall()
    conn.close()
    return [r["journal_date"] for r in rows]


def get_trades_for_date(trade_date: str) -> list[Trade]:
    """Get all trades for a specific date."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades WHERE trade_date = ? ORDER BY id", (trade_date,)
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


def get_trades_in_range(start_date: str, end_date: str) -> list[Trade]:
    """Get all trades between two dates (inclusive)."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades WHERE trade_date >= ? AND trade_date <= ? ORDER BY trade_date, id",
        (start_date, end_date),
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


def get_journals_in_range(start_date: str, end_date: str) -> list[DailyJournal]:
    """Get all journal entries between two dates (inclusive)."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM daily_journal WHERE journal_date >= ? AND journal_date <= ? ORDER BY journal_date",
        (start_date, end_date),
    ).fetchall()
    conn.close()
    return [_row_to_journal(r) for r in rows]


# --- Playbook ---

def _row_to_playbook(row: sqlite3.Row) -> PlaybookSetup:
    return PlaybookSetup(
        id=row["id"],
        name=row["name"],
        setup_type=row["setup_type"],
        rules=row["rules"],
        description=row["description"],
        active=bool(row["active"]),
        created_at=row["created_at"],
    )


def _row_to_grade(row: sqlite3.Row) -> TradeGrade:
    return TradeGrade(
        id=row["id"],
        trade_id=row["trade_id"],
        playbook_id=row["playbook_id"],
        rules_followed=row["rules_followed"],
        rules_broken=row["rules_broken"],
        compliance_pct=row["compliance_pct"],
        notes=row["notes"],
        created_at=row["created_at"],
    )


def insert_playbook(setup: PlaybookSetup) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            "INSERT INTO playbook_setups (name, setup_type, rules, description) VALUES (?, ?, ?, ?)",
            (setup.name, setup.setup_type, setup.rules, setup.description),
        )
        setup_id = cursor.lastrowid
    conn.close()
    return setup_id


def get_all_playbooks(active_only: bool = True) -> list[PlaybookSetup]:
    conn = get_connection()
    if active_only:
        rows = conn.execute("SELECT * FROM playbook_setups WHERE active = 1 ORDER BY name").fetchall()
    else:
        rows = conn.execute("SELECT * FROM playbook_setups ORDER BY name").fetchall()
    conn.close()
    return [_row_to_playbook(r) for r in rows]


def get_playbook(playbook_id: int) -> Optional[PlaybookSetup]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM playbook_setups WHERE id = ?", (playbook_id,)).fetchone()
    conn.close()
    return _row_to_playbook(row) if row else None


def delete_playbook(playbook_id: int) -> None:
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM playbook_setups WHERE id = ?", (playbook_id,))
    conn.close()


def upsert_trade_grade(grade: TradeGrade) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO trade_grades (trade_id, playbook_id, rules_followed, rules_broken, compliance_pct, notes)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                rules_followed=excluded.rules_followed, rules_broken=excluded.rules_broken,
                compliance_pct=excluded.compliance_pct, notes=excluded.notes""",
            (grade.trade_id, grade.playbook_id, grade.rules_followed, grade.rules_broken,
             grade.compliance_pct, grade.notes),
        )
        grade_id = cursor.lastrowid
    conn.close()
    return grade_id


def get_grades_for_trade(trade_id: int) -> list[TradeGrade]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trade_grades WHERE trade_id = ? ORDER BY created_at DESC", (trade_id,)
    ).fetchall()
    conn.close()
    return [_row_to_grade(r) for r in rows]


def get_all_grades() -> list[TradeGrade]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM trade_grades ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_row_to_grade(r) for r in rows]


# --- Watchlist ---

def _row_to_watchlist(row: sqlite3.Row) -> WatchlistItem:
    return WatchlistItem(
        id=row["id"],
        pair=row["pair"],
        bias=row["bias"],
        timeframe=row["timeframe"],
        key_levels=row["key_levels"],
        notes=row["notes"],
        setup_type=row["setup_type"],
        alert_price=row["alert_price"],
        active=bool(row["active"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def insert_watchlist_item(item: WatchlistItem) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO watchlist (pair, bias, timeframe, key_levels, notes, setup_type, alert_price)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (item.pair, item.bias, item.timeframe, item.key_levels,
             item.notes, item.setup_type, item.alert_price),
        )
        item_id = cursor.lastrowid
    conn.close()
    return item_id


def get_all_watchlist(active_only: bool = True) -> list[WatchlistItem]:
    conn = get_connection()
    if active_only:
        rows = conn.execute("SELECT * FROM watchlist WHERE active = 1 ORDER BY updated_at DESC").fetchall()
    else:
        rows = conn.execute("SELECT * FROM watchlist ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [_row_to_watchlist(r) for r in rows]


def update_watchlist_item(item: WatchlistItem) -> None:
    conn = get_connection()
    with conn:
        conn.execute(
            """UPDATE watchlist SET pair=?, bias=?, timeframe=?, key_levels=?,
               notes=?, setup_type=?, alert_price=?, active=?, updated_at=datetime('now')
               WHERE id=?""",
            (item.pair, item.bias, item.timeframe, item.key_levels,
             item.notes, item.setup_type, item.alert_price, int(item.active), item.id),
        )
    conn.close()


def delete_watchlist_item(item_id: int) -> None:
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM watchlist WHERE id = ?", (item_id,))
    conn.close()
