"""
One-time migration: export local SQLite data to Neon PostgreSQL.

Usage:
    DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require" python3 -m scripts.migrate_to_postgres

This reads from local data/trades.db and writes to the PostgreSQL database.
Chart files from charts/ are base64-encoded and stored in the chart_images table.
"""
import os
import sys
import sqlite3
import base64

import psycopg2
import psycopg2.extras

# Paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
DB_PATH = os.path.join(PROJECT_ROOT, "data", "trades.db")
CHARTS_DIR = os.path.join(PROJECT_ROOT, "charts")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: Set DATABASE_URL environment variable")
    sys.exit(1)

if not os.path.exists(DB_PATH):
    print(f"ERROR: SQLite database not found at {DB_PATH}")
    sys.exit(1)


def get_sqlite():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_pg():
    return psycopg2.connect(DATABASE_URL)


def migrate_table(sqlite_conn, pg_conn, table, columns, has_serial_id=True):
    """Migrate all rows from a SQLite table to PostgreSQL."""
    rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
    if not rows:
        print(f"  {table}: 0 rows (empty)")
        return

    col_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    sql = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"

    cur = pg_conn.cursor()
    count = 0
    for row in rows:
        values = []
        for col in columns:
            val = row[col] if col in row.keys() else None
            values.append(val)
        try:
            cur.execute(sql, values)
            count += 1
        except Exception as e:
            pg_conn.rollback()
            print(f"  WARNING: Skipping row in {table}: {e}")
            continue

    # Reset sequence to max id
    if has_serial_id and "id" in columns:
        cur.execute(f"SELECT MAX(id) FROM {table}")
        max_id = cur.fetchone()[0]
        if max_id:
            cur.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), %s)", (max_id,))

    pg_conn.commit()
    print(f"  {table}: {count}/{len(rows)} rows migrated")


def migrate_charts(sqlite_conn, pg_conn):
    """Migrate chart files from filesystem to chart_images table."""
    rows = sqlite_conn.execute("SELECT id, chart_path, user_id FROM trades WHERE chart_path IS NOT NULL AND chart_path != ''").fetchall()
    if not rows:
        print("  chart_images: 0 charts to migrate")
        return

    cur = pg_conn.cursor()
    count = 0
    for row in rows:
        chart_path = row["chart_path"]
        if chart_path.startswith("db://"):
            continue  # Already in DB format

        abs_path = os.path.join(PROJECT_ROOT, chart_path)
        if not os.path.exists(abs_path):
            print(f"  WARNING: Chart file missing: {chart_path}")
            continue

        with open(abs_path, "rb") as f:
            image_bytes = f.read()

        b64 = base64.b64encode(image_bytes).decode("ascii")
        filename = os.path.basename(chart_path)
        ext = os.path.splitext(filename)[1].lower()
        mime_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
        mime_type = mime_types.get(ext, "image/png")
        user_id = row["user_id"] if row["user_id"] else 1

        try:
            cur.execute(
                "INSERT INTO chart_images (trade_id, user_id, filename, mime_type, image_data) VALUES (%s, %s, %s, %s, %s)",
                (row["id"], user_id, filename, mime_type, b64))
            # Update trade to use db:// path
            cur.execute(
                "UPDATE trades SET chart_path = %s WHERE id = %s",
                (f"db://{row['id']}", row["id"]))
            count += 1
        except Exception as e:
            pg_conn.rollback()
            print(f"  WARNING: Failed to migrate chart for trade {row['id']}: {e}")
            continue

    pg_conn.commit()
    print(f"  chart_images: {count}/{len(rows)} charts migrated")


def main():
    print("=" * 50)
    print("The Chamber: SQLite → PostgreSQL Migration")
    print("=" * 50)
    print(f"Source: {DB_PATH}")
    print(f"Target: {DATABASE_URL[:40]}...")
    print()

    sqlite_conn = get_sqlite()
    pg_conn = get_pg()

    # First, run init_db to create all tables
    print("Creating PostgreSQL schema...")
    sys.path.insert(0, PROJECT_ROOT)
    os.environ["DATABASE_URL"] = DATABASE_URL
    # Re-import to pick up DATABASE_URL
    from lib.database import init_db
    init_db()
    print("  Schema created.\n")

    # Reconnect after init
    pg_conn.close()
    pg_conn = get_pg()

    print("Migrating tables...")

    # 1. Users (no FK dependencies)
    migrate_table(sqlite_conn, pg_conn, "users", [
        "id", "email", "username", "password_hash", "security_question", "security_answer_hash", "created_at"
    ])

    # 2. Trades (depends on users via user_id)
    migrate_table(sqlite_conn, pg_conn, "trades", [
        "id", "pair", "direction", "entry_price", "exit_price", "pnl_pips", "pnl_dollar",
        "trade_date", "reasoning", "chart_path", "user_id", "created_at"
    ])

    # 3. Analyses (depends on trades)
    migrate_table(sqlite_conn, pg_conn, "analyses", [
        "id", "trade_id", "provider", "model", "analysis_text", "user_id", "created_at"
    ])

    # 4. Daily journal
    migrate_table(sqlite_conn, pg_conn, "daily_journal", [
        "id", "journal_date", "sleep", "energy", "focus", "mood", "stress", "confidence",
        "readiness_score", "readiness_label", "emotional_states", "ict_setups_used",
        "market_condition", "mistakes", "reflection", "lessons_learned",
        "tomorrows_improvements", "user_id", "created_at", "updated_at"
    ])

    # 5. Playbook setups
    migrate_table(sqlite_conn, pg_conn, "playbook_setups", [
        "id", "name", "setup_type", "rules", "description", "active", "user_id", "created_at"
    ])

    # 6. Trade grades (depends on trades + playbook_setups)
    migrate_table(sqlite_conn, pg_conn, "trade_grades", [
        "id", "trade_id", "playbook_id", "rules_followed", "rules_broken",
        "compliance_pct", "notes", "user_id", "created_at"
    ])

    # 7. Watchlist
    migrate_table(sqlite_conn, pg_conn, "watchlist", [
        "id", "pair", "bias", "timeframe", "key_levels", "notes", "setup_type",
        "alert_price", "active", "user_id", "created_at", "updated_at"
    ])

    # 8. User API keys
    migrate_table(sqlite_conn, pg_conn, "user_api_keys", [
        "id", "user_id", "provider", "api_key", "updated_at"
    ])

    # 9. Session tokens
    migrate_table(sqlite_conn, pg_conn, "session_tokens", [
        "token", "user_id", "created_at"
    ], has_serial_id=False)

    print()

    # 10. Chart files → chart_images
    print("Migrating chart files to database...")
    migrate_charts(sqlite_conn, pg_conn)

    print()
    print("Migration complete!")

    sqlite_conn.close()
    pg_conn.close()


if __name__ == "__main__":
    main()
