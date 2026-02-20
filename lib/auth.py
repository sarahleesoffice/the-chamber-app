"""
Authentication module for The Chamber.
Handles user registration, login, and session management.
"""
import bcrypt
import streamlit as st

from lib.database import get_connection


def init_users_table() -> None:
    """Create users table if it doesn't exist."""
    conn = get_connection()
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
    conn.close()


def register_user(email: str, username: str, password: str) -> int | None:
    """Register a new user. Returns user id or None if email already exists."""
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    conn = get_connection()
    try:
        with conn:
            cursor = conn.execute(
                "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)",
                (email.lower().strip(), username.strip(), password_hash),
            )
            return cursor.lastrowid
    except Exception:
        return None
    finally:
        conn.close()


def authenticate_user(email: str, password: str) -> dict | None:
    """Authenticate a user. Returns user dict or None."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM users WHERE email = ?", (email.lower().strip(),)
    ).fetchone()
    conn.close()

    if row is None:
        return None

    if bcrypt.checkpw(password.encode("utf-8"), row["password_hash"].encode("utf-8")):
        return {
            "id": row["id"],
            "email": row["email"],
            "username": row["username"],
        }
    return None


def get_current_user_id() -> int:
    """Get the logged-in user's ID from session state."""
    return st.session_state.get("user_id", 0)


def get_current_username() -> str:
    """Get the logged-in user's username from session state."""
    return st.session_state.get("username", "")


def is_logged_in() -> bool:
    """Check if a user is currently logged in."""
    return st.session_state.get("user_id", 0) > 0


def login_user(user: dict) -> None:
    """Set session state for a logged-in user."""
    st.session_state["user_id"] = user["id"]
    st.session_state["username"] = user["username"]
    st.session_state["user_email"] = user["email"]


def logout_user() -> None:
    """Clear session state for logout."""
    for key in ["user_id", "username", "user_email"]:
        if key in st.session_state:
            del st.session_state[key]


# ── Per-user API Keys ─────────────────────────────────────────

def init_api_keys_table() -> None:
    """Create user_api_keys table if it doesn't exist."""
    conn = get_connection()
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                api_key TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, provider),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
    conn.close()


def save_api_key(user_id: int, provider: str, api_key: str) -> None:
    """Save or update an API key for a user+provider."""
    conn = get_connection()
    with conn:
        conn.execute(
            """INSERT INTO user_api_keys (user_id, provider, api_key, updated_at)
               VALUES (?, ?, ?, datetime('now'))
               ON CONFLICT(user_id, provider) DO UPDATE SET
               api_key=excluded.api_key, updated_at=datetime('now')""",
            (user_id, provider, api_key),
        )
    conn.close()


def get_api_key(user_id: int, provider: str) -> str | None:
    """Get a user's API key for a specific provider."""
    conn = get_connection()
    row = conn.execute(
        "SELECT api_key FROM user_api_keys WHERE user_id = ? AND provider = ?",
        (user_id, provider),
    ).fetchone()
    conn.close()
    return row["api_key"] if row else None


def delete_api_key(user_id: int, provider: str) -> None:
    """Delete a user's API key for a specific provider."""
    conn = get_connection()
    with conn:
        conn.execute(
            "DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?",
            (user_id, provider),
        )
    conn.close()


def has_api_key(user_id: int, provider: str) -> bool:
    """Check if a user has an API key for a provider."""
    return get_api_key(user_id, provider) is not None
