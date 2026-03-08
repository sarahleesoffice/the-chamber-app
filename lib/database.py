import os
import sqlite3
import base64
from contextlib import contextmanager
from typing import Optional

try:
    import psycopg2
    import psycopg2.extras
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False

from lib.models import Trade, Analysis, DailyJournal, PlaybookSetup, TradeGrade, WatchlistItem

# ── Configuration ─────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")
USE_POSTGRES = bool(DATABASE_URL and HAS_POSTGRES)

# SQLite paths (local dev only)
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DB_DIR, "trades.db")


# ── Connection & query helpers ────────────────────────────────

def get_connection():
    """Get a database connection (PostgreSQL or SQLite)."""
    if USE_POSTGRES:
        return psycopg2.connect(DATABASE_URL)
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def _db():
    """Database connection with auto commit/rollback."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _q(sql: str) -> str:
    """Translate SQLite SQL to PostgreSQL if needed."""
    if not USE_POSTGRES:
        return sql
    return sql.replace("?", "%s").replace("datetime('now')", "NOW()::TEXT")


def _exec(conn, sql: str, params=None):
    """Execute SQL with the appropriate cursor."""
    sql = _q(sql)
    if USE_POSTGRES:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        return cur
    return conn.execute(sql, params or ())


def _insert(conn, sql: str, params=None) -> int:
    """Execute INSERT and return the new row id."""
    if USE_POSTGRES:
        sql = _q(sql).rstrip().rstrip(";") + " RETURNING id"
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        return cur.fetchone()["id"]
    cur = conn.execute(sql, params or ())
    return cur.lastrowid


# ── Schema ────────────────────────────────────────────────────

def _column_exists(conn, table: str, column: str) -> bool:
    if USE_POSTGRES:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
            (table, column),
        )
        return cur.fetchone() is not None
    cursor = conn.execute(f"PRAGMA table_info({table})")
    return column in [row["name"] for row in cursor.fetchall()]


_PG_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        security_question TEXT DEFAULT '',
        security_answer_hash TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        pair TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('long', 'short')),
        entry_price DOUBLE PRECISION NOT NULL,
        exit_price DOUBLE PRECISION NOT NULL,
        pnl_pips DOUBLE PRECISION NOT NULL,
        pnl_dollar DOUBLE PRECISION,
        trade_date TEXT NOT NULL,
        reasoning TEXT DEFAULT '',
        chart_path TEXT,
        user_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS analyses (
        id SERIAL PRIMARY KEY,
        trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        analysis_text TEXT NOT NULL,
        user_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS daily_journal (
        id SERIAL PRIMARY KEY,
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
        user_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        updated_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS playbook_setups (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        setup_type TEXT NOT NULL,
        rules TEXT NOT NULL DEFAULT '',
        description TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        user_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS trade_grades (
        id SERIAL PRIMARY KEY,
        trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
        playbook_id INTEGER NOT NULL REFERENCES playbook_setups(id) ON DELETE CASCADE,
        rules_followed TEXT DEFAULT '',
        rules_broken TEXT DEFAULT '',
        compliance_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        user_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS watchlist (
        id SERIAL PRIMARY KEY,
        pair TEXT NOT NULL,
        bias TEXT NOT NULL DEFAULT 'neutral',
        timeframe TEXT DEFAULT '',
        key_levels TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        setup_type TEXT DEFAULT '',
        alert_price DOUBLE PRECISION,
        active INTEGER NOT NULL DEFAULT 1,
        user_id INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        updated_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS user_api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        api_key TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT NOW()::TEXT,
        UNIQUE(user_id, provider)
    )""",
    """CREATE TABLE IF NOT EXISTS session_tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
    """CREATE TABLE IF NOT EXISTS chart_images (
        id SERIAL PRIMARY KEY,
        trade_id INTEGER NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL DEFAULT 1,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'image/png',
        image_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT NOW()::TEXT
    )""",
]


def init_db() -> None:
    """Initialize database schema."""
    with _db() as conn:
        if USE_POSTGRES:
            cur = conn.cursor()
            for ddl in _PG_SCHEMA:
                cur.execute(ddl)
            # Migration: add security columns if missing
            if not _column_exists(conn, "users", "security_question"):
                cur.execute("ALTER TABLE users ADD COLUMN security_question TEXT DEFAULT ''")
                cur.execute("ALTER TABLE users ADD COLUMN security_answer_hash TEXT DEFAULT ''")
        else:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    username TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    security_question TEXT DEFAULT '',
                    security_answer_hash TEXT DEFAULT '',
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
                CREATE TABLE IF NOT EXISTS user_api_keys (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    provider TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(user_id, provider),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS session_tokens (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS chart_images (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    trade_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL DEFAULT 1,
                    filename TEXT NOT NULL,
                    mime_type TEXT NOT NULL DEFAULT 'image/png',
                    image_data TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
                );
            """)
            # SQLite migration: add user_id to existing tables
            for table in ["trades", "analyses", "daily_journal", "playbook_setups", "trade_grades", "watchlist"]:
                if not _column_exists(conn, table, "user_id"):
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER DEFAULT 1")
            # Migration: make analyses.trade_id nullable for standalone analyses
            try:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS analyses_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        trade_id INTEGER,
                        provider TEXT NOT NULL,
                        model TEXT NOT NULL,
                        analysis_text TEXT NOT NULL,
                        user_id INTEGER DEFAULT 1,
                        created_at TEXT NOT NULL DEFAULT (datetime('now')),
                        FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
                    )
                """)
                # Check if old table has NOT NULL on trade_id
                info = conn.execute("PRAGMA table_info(analyses)").fetchall()
                for col in info:
                    if col[1] == "trade_id" and col[3] == 1:  # notnull = 1
                        conn.execute("INSERT INTO analyses_new SELECT * FROM analyses")
                        conn.execute("DROP TABLE analyses")
                        conn.execute("ALTER TABLE analyses_new RENAME TO analyses")
                        break
                else:
                    conn.execute("DROP TABLE IF EXISTS analyses_new")
            except Exception:
                conn.execute("DROP TABLE IF EXISTS analyses_new")

            # Add security columns to users if missing
            if not _column_exists(conn, "users", "security_question"):
                conn.execute("ALTER TABLE users ADD COLUMN security_question TEXT DEFAULT ''")
                conn.execute("ALTER TABLE users ADD COLUMN security_answer_hash TEXT DEFAULT ''")


# ── Row converters ────────────────────────────────────────────

def _row_to_trade(row) -> Trade:
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
        user_id=row.get("user_id") if isinstance(row, dict) else (row["user_id"] if "user_id" in row.keys() else None),
    )


def _row_to_analysis(row) -> Analysis:
    return Analysis(
        id=row["id"],
        trade_id=row["trade_id"],
        provider=row["provider"],
        model=row["model"],
        analysis_text=row["analysis_text"],
        created_at=row["created_at"],
        user_id=row.get("user_id") if isinstance(row, dict) else (row["user_id"] if "user_id" in row.keys() else None),
    )


def _row_to_journal(row) -> DailyJournal:
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
        user_id=row.get("user_id") if isinstance(row, dict) else (row["user_id"] if "user_id" in row.keys() else None),
    )


def _row_to_playbook(row) -> PlaybookSetup:
    return PlaybookSetup(
        id=row["id"],
        name=row["name"],
        setup_type=row["setup_type"],
        rules=row["rules"],
        description=row["description"],
        active=bool(row["active"]),
        created_at=row["created_at"],
        user_id=row.get("user_id") if isinstance(row, dict) else (row["user_id"] if "user_id" in row.keys() else None),
    )


def _row_to_grade(row) -> TradeGrade:
    return TradeGrade(
        id=row["id"],
        trade_id=row["trade_id"],
        playbook_id=row["playbook_id"],
        rules_followed=row["rules_followed"],
        rules_broken=row["rules_broken"],
        compliance_pct=row["compliance_pct"],
        notes=row["notes"],
        created_at=row["created_at"],
        user_id=row.get("user_id") if isinstance(row, dict) else (row["user_id"] if "user_id" in row.keys() else None),
    )


def _row_to_watchlist(row) -> WatchlistItem:
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
        user_id=row.get("user_id") if isinstance(row, dict) else (row["user_id"] if "user_id" in row.keys() else None),
    )


# ── Trades ────────────────────────────────────────────────────

def insert_trade(trade: Trade, user_id: int = 1) -> int:
    with _db() as conn:
        return _insert(conn,
            """INSERT INTO trades (pair, direction, entry_price, exit_price, pnl_pips, pnl_dollar, trade_date, reasoning, chart_path, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (trade.pair, trade.direction, trade.entry_price, trade.exit_price,
             trade.pnl_pips, trade.pnl_dollar, trade.trade_date, trade.reasoning, trade.chart_path, user_id))


def get_trade(trade_id: int, user_id: int = 1) -> Optional[Trade]:
    with _db() as conn:
        row = _exec(conn, "SELECT * FROM trades WHERE id = ? AND user_id = ?", (trade_id, user_id)).fetchone()
    return _row_to_trade(row) if row else None


def get_all_trades(user_id: int = 1, limit: int = 50, offset: int = 0) -> list[Trade]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM trades WHERE user_id = ? ORDER BY trade_date DESC, id DESC LIMIT ? OFFSET ?",
            (user_id, limit, offset)).fetchall()
    return [_row_to_trade(r) for r in rows]


def get_trades_by_pair(pair: str, user_id: int = 1) -> list[Trade]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM trades WHERE pair = ? AND user_id = ? ORDER BY trade_date DESC",
            (pair, user_id)).fetchall()
    return [_row_to_trade(r) for r in rows]


def get_distinct_pairs(user_id: int = 1) -> list[str]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT DISTINCT pair FROM trades WHERE user_id = ? ORDER BY pair", (user_id,)).fetchall()
    return [r["pair"] for r in rows]


def get_trade_count(user_id: int = 1) -> int:
    with _db() as conn:
        row = _exec(conn,
            "SELECT COUNT(*) AS cnt FROM trades WHERE user_id = ?", (user_id,)).fetchone()
    return row["cnt"]


def delete_trade(trade_id: int, user_id: int = 1) -> None:
    with _db() as conn:
        _exec(conn, "DELETE FROM trades WHERE id = ? AND user_id = ?", (trade_id, user_id))


def delete_all_trades(user_id: int = 1) -> int:
    """Delete all trades for a user. Returns the number of trades deleted."""
    with _db() as conn:
        row = _exec(conn, "SELECT COUNT(*) AS cnt FROM trades WHERE user_id = ?", (user_id,)).fetchone()
        count = row["cnt"]
        _exec(conn, "DELETE FROM trades WHERE user_id = ?", (user_id,))
    return count


def get_trades_for_date(trade_date: str, user_id: int = 1) -> list[Trade]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM trades WHERE trade_date = ? AND user_id = ? ORDER BY id",
            (trade_date, user_id)).fetchall()
    return [_row_to_trade(r) for r in rows]


def get_trades_in_range(start_date: str, end_date: str, user_id: int = 1) -> list[Trade]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM trades WHERE trade_date >= ? AND trade_date <= ? AND user_id = ? ORDER BY trade_date, id",
            (start_date, end_date, user_id)).fetchall()
    return [_row_to_trade(r) for r in rows]


def update_trade_chart_path(trade_id: int, chart_path: str, user_id: int = 1) -> None:
    with _db() as conn:
        _exec(conn, "UPDATE trades SET chart_path = ? WHERE id = ? AND user_id = ?",
              (chart_path, trade_id, user_id))


# ── Analyses ──────────────────────────────────────────────────

def insert_analysis(analysis: Analysis, user_id: int = 1, created_at: str | None = None) -> int:
    with _db() as conn:
        if created_at:
            return _insert(conn,
                """INSERT INTO analyses (trade_id, provider, model, analysis_text, user_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (analysis.trade_id, analysis.provider, analysis.model, analysis.analysis_text, user_id, created_at))
        return _insert(conn,
            """INSERT INTO analyses (trade_id, provider, model, analysis_text, user_id)
               VALUES (?, ?, ?, ?, ?)""",
            (analysis.trade_id, analysis.provider, analysis.model, analysis.analysis_text, user_id))


def get_analyses_for_trade(trade_id: int, user_id: int = 1) -> list[Analysis]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM analyses WHERE trade_id = ? AND user_id = ? ORDER BY created_at DESC",
            (trade_id, user_id)).fetchall()
    return [_row_to_analysis(r) for r in rows]


def get_analyses_in_range(start_date: str, end_date: str, user_id: int = 1) -> list[Analysis]:
    """Return analyses created within a date range (YYYY-MM-DD, inclusive)."""
    with _db() as conn:
        rows = _exec(conn,
            """SELECT * FROM analyses
               WHERE substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?
               AND user_id = ?
               ORDER BY created_at DESC""",
            (start_date, end_date, user_id)).fetchall()
    return [_row_to_analysis(r) for r in rows]


def delete_analysis(analysis_id: int, user_id: int = 1) -> None:
    """Delete a single analysis by ID."""
    with _db() as conn:
        _exec(conn, "DELETE FROM analyses WHERE id = ? AND user_id = ?",
              (analysis_id, user_id))


# ── Daily Journal ─────────────────────────────────────────────

def upsert_journal(journal: DailyJournal, user_id: int = 1) -> int:
    with _db() as conn:
        existing = _exec(conn,
            "SELECT id FROM daily_journal WHERE journal_date = ? AND user_id = ?",
            (journal.journal_date, user_id)).fetchone()

        if existing:
            _exec(conn,
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
                 journal.journal_date, user_id))
            return existing["id"]
        else:
            return _insert(conn,
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
                 journal.tomorrows_improvements, user_id))


def get_journal(journal_date: str, user_id: int = 1) -> Optional[DailyJournal]:
    with _db() as conn:
        row = _exec(conn,
            "SELECT * FROM daily_journal WHERE journal_date = ? AND user_id = ?",
            (journal_date, user_id)).fetchone()
    return _row_to_journal(row) if row else None


def get_journal_dates(user_id: int = 1) -> list[str]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT journal_date FROM daily_journal WHERE user_id = ? ORDER BY journal_date DESC",
            (user_id,)).fetchall()
    return [r["journal_date"] for r in rows]


def get_journals_in_range(start_date: str, end_date: str, user_id: int = 1) -> list[DailyJournal]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM daily_journal WHERE journal_date >= ? AND journal_date <= ? AND user_id = ? ORDER BY journal_date",
            (start_date, end_date, user_id)).fetchall()
    return [_row_to_journal(r) for r in rows]


# ── Playbook ──────────────────────────────────────────────────

def insert_playbook(setup: PlaybookSetup, user_id: int = 1) -> int:
    with _db() as conn:
        return _insert(conn,
            "INSERT INTO playbook_setups (name, setup_type, rules, description, user_id) VALUES (?, ?, ?, ?, ?)",
            (setup.name, setup.setup_type, setup.rules, setup.description, user_id))


def get_all_playbooks(user_id: int = 1, active_only: bool = True) -> list[PlaybookSetup]:
    with _db() as conn:
        if active_only:
            rows = _exec(conn,
                "SELECT * FROM playbook_setups WHERE active = 1 AND user_id = ? ORDER BY name",
                (user_id,)).fetchall()
        else:
            rows = _exec(conn,
                "SELECT * FROM playbook_setups WHERE user_id = ? ORDER BY name",
                (user_id,)).fetchall()
    return [_row_to_playbook(r) for r in rows]


def get_playbook(playbook_id: int, user_id: int = 1) -> Optional[PlaybookSetup]:
    with _db() as conn:
        row = _exec(conn,
            "SELECT * FROM playbook_setups WHERE id = ? AND user_id = ?",
            (playbook_id, user_id)).fetchone()
    return _row_to_playbook(row) if row else None


def delete_playbook(playbook_id: int, user_id: int = 1) -> None:
    with _db() as conn:
        _exec(conn, "DELETE FROM playbook_setups WHERE id = ? AND user_id = ?", (playbook_id, user_id))


def upsert_trade_grade(grade: TradeGrade, user_id: int = 1) -> int:
    with _db() as conn:
        return _insert(conn,
            """INSERT INTO trade_grades (trade_id, playbook_id, rules_followed, rules_broken, compliance_pct, notes, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                rules_followed=excluded.rules_followed, rules_broken=excluded.rules_broken,
                compliance_pct=excluded.compliance_pct, notes=excluded.notes""",
            (grade.trade_id, grade.playbook_id, grade.rules_followed, grade.rules_broken,
             grade.compliance_pct, grade.notes, user_id))


def get_grades_for_trade(trade_id: int, user_id: int = 1) -> list[TradeGrade]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM trade_grades WHERE trade_id = ? AND user_id = ? ORDER BY created_at DESC",
            (trade_id, user_id)).fetchall()
    return [_row_to_grade(r) for r in rows]


def get_all_grades(user_id: int = 1) -> list[TradeGrade]:
    with _db() as conn:
        rows = _exec(conn,
            "SELECT * FROM trade_grades WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)).fetchall()
    return [_row_to_grade(r) for r in rows]


# ── Watchlist ─────────────────────────────────────────────────

def insert_watchlist_item(item: WatchlistItem, user_id: int = 1) -> int:
    with _db() as conn:
        return _insert(conn,
            """INSERT INTO watchlist (pair, bias, timeframe, key_levels, notes, setup_type, alert_price, user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (item.pair, item.bias, item.timeframe, item.key_levels,
             item.notes, item.setup_type, item.alert_price, user_id))


def get_all_watchlist(user_id: int = 1, active_only: bool = True) -> list[WatchlistItem]:
    with _db() as conn:
        if active_only:
            rows = _exec(conn,
                "SELECT * FROM watchlist WHERE active = 1 AND user_id = ? ORDER BY updated_at DESC",
                (user_id,)).fetchall()
        else:
            rows = _exec(conn,
                "SELECT * FROM watchlist WHERE user_id = ? ORDER BY updated_at DESC",
                (user_id,)).fetchall()
    return [_row_to_watchlist(r) for r in rows]


def update_watchlist_item(item: WatchlistItem, user_id: int = 1) -> None:
    with _db() as conn:
        _exec(conn,
            """UPDATE watchlist SET pair=?, bias=?, timeframe=?, key_levels=?,
               notes=?, setup_type=?, alert_price=?, active=?, updated_at=datetime('now')
               WHERE id=? AND user_id=?""",
            (item.pair, item.bias, item.timeframe, item.key_levels,
             item.notes, item.setup_type, item.alert_price, int(item.active), item.id, user_id))


def delete_watchlist_item(item_id: int, user_id: int = 1) -> None:
    with _db() as conn:
        _exec(conn, "DELETE FROM watchlist WHERE id = ? AND user_id = ?", (item_id, user_id))


# ── Chart Images (DB storage for production) ─────────────────

def save_chart_to_db(trade_id: int, filename: str, mime_type: str, image_bytes: bytes, user_id: int = 1) -> int:
    b64 = base64.b64encode(image_bytes).decode("ascii")
    with _db() as conn:
        return _insert(conn,
            "INSERT INTO chart_images (trade_id, user_id, filename, mime_type, image_data) VALUES (?, ?, ?, ?, ?)",
            (trade_id, user_id, filename, mime_type, b64))


def get_chart_from_db(trade_id: int, user_id: int = 1) -> Optional[dict]:
    with _db() as conn:
        row = _exec(conn,
            "SELECT filename, mime_type, image_data FROM chart_images WHERE trade_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1",
            (trade_id, user_id)).fetchone()
    if not row:
        return None
    return {
        "filename": row["filename"],
        "mime_type": row["mime_type"],
        "image_data": base64.b64decode(row["image_data"]),
    }


def delete_chart_from_db(trade_id: int, user_id: int = 1) -> None:
    with _db() as conn:
        _exec(conn, "DELETE FROM chart_images WHERE trade_id = ? AND user_id = ?", (trade_id, user_id))
