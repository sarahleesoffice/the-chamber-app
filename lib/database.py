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


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    cursor = conn.execute(f"PRAGMA table_info({table})")
    columns = [row["name"] for row in cursor.fetchall()]
    return column in columns


def init_db() -> None:
    conn = get_connection()
    with conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

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
                journal_date TEXT NOT NULL,
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

        # ── Migration: add user_id to all data tables ──────────────
        tables_needing_user_id = [
            "trades", "analyses", "daily_journal",
            "playbook_setups", "trade_grades", "watchlist",
        ]
        for table in tables_needing_user_id:
            if not _column_exists(conn, table, "user_id"):
                conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER DEFAULT 1")

        # Remove old UNIQUE constraint on journal_date (now unique per user+date)
        # SQLite can't drop constraints, so we handle it in the upsert logic

    conn.close()


# ── Row converters ─────────────────────────────────────────────

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
        user_id=row["user_id"] if "user_id" in row.keys() else None,
    )


def _row_to_analysis(row: sqlite3.Row) -> Analysis:
    return Analysis(
        id=row["id"],
        trade_id=row["trade_id"],
        provider=row["provider"],
        model=row["model"],
        analysis_text=row["analysis_text"],
        created_at=row["created_at"],
        user_id=row["user_id"] if "user_id" in row.keys() else None,
    )


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
        user_id=row["user_id"] if "user_id" in row.keys() else None,
    )


def _row_to_playbook(row: sqlite3.Row) -> PlaybookSetup:
    return PlaybookSetup(
        id=row["id"],
        name=row["name"],
        setup_type=row["setup_type"],
        rules=row["rules"],
        description=row["description"],
        active=bool(row["active"]),
        created_at=row["created_at"],
        user_id=row["user_id"] if "user_id" in row.keys() else None,
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
        user_id=row["user_id"] if "user_id" in row.keys() else None,
    )


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
        user_id=row["user_id"] if "user_id" in row.keys() else None,
    )


# ── Trades ─────────────────────────────────────────────────────

def insert_trade(trade: Trade, user_id: int = 1) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO trades (pair, direction, entry_price, exit_price, pnl_pips, pnl_dollar, trade_date, reasoning, chart_path, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (trade.pair, trade.direction, trade.entry_price, trade.exit_price,
             trade.pnl_pips, trade.pnl_dollar, trade.trade_date, trade.reasoning, trade.chart_path, user_id),
        )
        trade_id = cursor.lastrowid
    conn.close()
    return trade_id


def get_trade(trade_id: int, user_id: int = 1) -> Optional[Trade]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM trades WHERE id = ? AND user_id = ?", (trade_id, user_id)
    ).fetchone()
    conn.close()
    return _row_to_trade(row) if row else None


def get_all_trades(user_id: int = 1, limit: int = 50, offset: int = 0) -> list[Trade]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades WHERE user_id = ? ORDER BY trade_date DESC, id DESC LIMIT ? OFFSET ?",
        (user_id, limit, offset),
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


def get_trades_by_pair(pair: str, user_id: int = 1) -> list[Trade]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades WHERE pair = ? AND user_id = ? ORDER BY trade_date DESC",
        (pair, user_id),
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


def get_distinct_pairs(user_id: int = 1) -> list[str]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT pair FROM trades WHERE user_id = ? ORDER BY pair", (user_id,)
    ).fetchall()
    conn.close()
    return [r["pair"] for r in rows]


def get_trade_count(user_id: int = 1) -> int:
    conn = get_connection()
    row = conn.execute(
        "SELECT COUNT(*) as cnt FROM trades WHERE user_id = ?", (user_id,)
    ).fetchone()
    conn.close()
    return row["cnt"]


def delete_trade(trade_id: int, user_id: int = 1) -> None:
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM trades WHERE id = ? AND user_id = ?", (trade_id, user_id))
    conn.close()


def get_trades_for_date(trade_date: str, user_id: int = 1) -> list[Trade]:
    """Get all trades for a specific date."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades WHERE trade_date = ? AND user_id = ? ORDER BY id",
        (trade_date, user_id),
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


def get_trades_in_range(start_date: str, end_date: str, user_id: int = 1) -> list[Trade]:
    """Get all trades between two dates (inclusive)."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trades WHERE trade_date >= ? AND trade_date <= ? AND user_id = ? ORDER BY trade_date, id",
        (start_date, end_date, user_id),
    ).fetchall()
    conn.close()
    return [_row_to_trade(r) for r in rows]


# ── Analyses ───────────────────────────────────────────────────

def insert_analysis(analysis: Analysis, user_id: int = 1) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO analyses (trade_id, provider, model, analysis_text, user_id)
               VALUES (?, ?, ?, ?, ?)""",
            (analysis.trade_id, analysis.provider, analysis.model, analysis.analysis_text, user_id),
        )
        analysis_id = cursor.lastrowid
    conn.close()
    return analysis_id


def get_analyses_for_trade(trade_id: int, user_id: int = 1) -> list[Analysis]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM analyses WHERE trade_id = ? AND user_id = ? ORDER BY created_at DESC",
        (trade_id, user_id),
    ).fetchall()
    conn.close()
    return [_row_to_analysis(r) for r in rows]


# ── Daily Journal ──────────────────────────────────────────────

def upsert_journal(journal: DailyJournal, user_id: int = 1) -> int:
    """Insert or update a daily journal entry (one per user per date)."""
    conn = get_connection()
    with conn:
        # Check if entry exists for this user+date
        existing = conn.execute(
            "SELECT id FROM daily_journal WHERE journal_date = ? AND user_id = ?",
            (journal.journal_date, user_id),
        ).fetchone()

        if existing:
            conn.execute(
                """UPDATE daily_journal SET
                    sleep=?, energy=?, focus=?, mood=?, stress=?, confidence=?,
                    readiness_score=?, readiness_label=?, emotional_states=?, ict_setups_used=?,
                    market_condition=?, mistakes=?, reflection=?, lessons_learned=?,
                    tomorrows_improvements=?, updated_at=datetime('now')
                   WHERE journal_date = ? AND user_id = ?""",
                (journal.sleep, journal.energy, journal.focus,
                 journal.mood, journal.stress, journal.confidence,
                 journal.readiness_score, journal.readiness_label,
                 journal.emotional_states, journal.ict_setups_used,
                 journal.market_condition, journal.mistakes,
                 journal.reflection, journal.lessons_learned,
                 journal.tomorrows_improvements,
                 journal.journal_date, user_id),
            )
            journal_id = existing["id"]
        else:
            cursor = conn.execute(
                """INSERT INTO daily_journal
                   (journal_date, sleep, energy, focus, mood, stress, confidence,
                    readiness_score, readiness_label, emotional_states, ict_setups_used,
                    market_condition, mistakes, reflection, lessons_learned,
                    tomorrows_improvements, user_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (journal.journal_date, journal.sleep, journal.energy, journal.focus,
                 journal.mood, journal.stress, journal.confidence,
                 journal.readiness_score, journal.readiness_label,
                 journal.emotional_states, journal.ict_setups_used,
                 journal.market_condition, journal.mistakes,
                 journal.reflection, journal.lessons_learned,
                 journal.tomorrows_improvements, user_id),
            )
            journal_id = cursor.lastrowid
    conn.close()
    return journal_id


def get_journal(journal_date: str, user_id: int = 1) -> Optional[DailyJournal]:
    """Get journal entry for a specific date (YYYY-MM-DD)."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM daily_journal WHERE journal_date = ? AND user_id = ?",
        (journal_date, user_id),
    ).fetchone()
    conn.close()
    return _row_to_journal(row) if row else None


def get_journal_dates(user_id: int = 1) -> list[str]:
    """Get all dates that have journal entries."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT journal_date FROM daily_journal WHERE user_id = ? ORDER BY journal_date DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return [r["journal_date"] for r in rows]


def get_journals_in_range(start_date: str, end_date: str, user_id: int = 1) -> list[DailyJournal]:
    """Get all journal entries between two dates (inclusive)."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM daily_journal WHERE journal_date >= ? AND journal_date <= ? AND user_id = ? ORDER BY journal_date",
        (start_date, end_date, user_id),
    ).fetchall()
    conn.close()
    return [_row_to_journal(r) for r in rows]


# ── Playbook ───────────────────────────────────────────────────

def insert_playbook(setup: PlaybookSetup, user_id: int = 1) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            "INSERT INTO playbook_setups (name, setup_type, rules, description, user_id) VALUES (?, ?, ?, ?, ?)",
            (setup.name, setup.setup_type, setup.rules, setup.description, user_id),
        )
        setup_id = cursor.lastrowid
    conn.close()
    return setup_id


def get_all_playbooks(user_id: int = 1, active_only: bool = True) -> list[PlaybookSetup]:
    conn = get_connection()
    if active_only:
        rows = conn.execute(
            "SELECT * FROM playbook_setups WHERE active = 1 AND user_id = ? ORDER BY name",
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM playbook_setups WHERE user_id = ? ORDER BY name",
            (user_id,),
        ).fetchall()
    conn.close()
    return [_row_to_playbook(r) for r in rows]


def get_playbook(playbook_id: int, user_id: int = 1) -> Optional[PlaybookSetup]:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM playbook_setups WHERE id = ? AND user_id = ?",
        (playbook_id, user_id),
    ).fetchone()
    conn.close()
    return _row_to_playbook(row) if row else None


def delete_playbook(playbook_id: int, user_id: int = 1) -> None:
    conn = get_connection()
    with conn:
        conn.execute(
            "DELETE FROM playbook_setups WHERE id = ? AND user_id = ?",
            (playbook_id, user_id),
        )
    conn.close()


def upsert_trade_grade(grade: TradeGrade, user_id: int = 1) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO trade_grades (trade_id, playbook_id, rules_followed, rules_broken, compliance_pct, notes, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                rules_followed=excluded.rules_followed, rules_broken=excluded.rules_broken,
                compliance_pct=excluded.compliance_pct, notes=excluded.notes""",
            (grade.trade_id, grade.playbook_id, grade.rules_followed, grade.rules_broken,
             grade.compliance_pct, grade.notes, user_id),
        )
        grade_id = cursor.lastrowid
    conn.close()
    return grade_id


def get_grades_for_trade(trade_id: int, user_id: int = 1) -> list[TradeGrade]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trade_grades WHERE trade_id = ? AND user_id = ? ORDER BY created_at DESC",
        (trade_id, user_id),
    ).fetchall()
    conn.close()
    return [_row_to_grade(r) for r in rows]


def get_all_grades(user_id: int = 1) -> list[TradeGrade]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM trade_grades WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
    conn.close()
    return [_row_to_grade(r) for r in rows]


# ── Watchlist ──────────────────────────────────────────────────

def insert_watchlist_item(item: WatchlistItem, user_id: int = 1) -> int:
    conn = get_connection()
    with conn:
        cursor = conn.execute(
            """INSERT INTO watchlist (pair, bias, timeframe, key_levels, notes, setup_type, alert_price, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (item.pair, item.bias, item.timeframe, item.key_levels,
             item.notes, item.setup_type, item.alert_price, user_id),
        )
        item_id = cursor.lastrowid
    conn.close()
    return item_id


def get_all_watchlist(user_id: int = 1, active_only: bool = True) -> list[WatchlistItem]:
    conn = get_connection()
    if active_only:
        rows = conn.execute(
            "SELECT * FROM watchlist WHERE active = 1 AND user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM watchlist WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    conn.close()
    return [_row_to_watchlist(r) for r in rows]


def update_watchlist_item(item: WatchlistItem, user_id: int = 1) -> None:
    conn = get_connection()
    with conn:
        conn.execute(
            """UPDATE watchlist SET pair=?, bias=?, timeframe=?, key_levels=?,
               notes=?, setup_type=?, alert_price=?, active=?, updated_at=datetime('now')
               WHERE id=? AND user_id=?""",
            (item.pair, item.bias, item.timeframe, item.key_levels,
             item.notes, item.setup_type, item.alert_price, int(item.active), item.id, user_id),
        )
    conn.close()


def delete_watchlist_item(item_id: int, user_id: int = 1) -> None:
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM watchlist WHERE id = ? AND user_id = ?", (item_id, user_id))
    conn.close()
