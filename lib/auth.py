"""
Authentication module for The Chamber.
Handles user registration, login, session management, and password recovery.
"""
import bcrypt
import uuid
import streamlit as st
import streamlit.components.v1 as components

from lib.database import _db, _exec, _insert, USE_POSTGRES


# ── User Management ──────────────────────────────────────────

def init_users_table() -> None:
    """Create users table if it doesn't exist (no-op if init_db() already ran)."""
    with _db() as conn:
        if USE_POSTGRES:
            conn.cursor().execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    username TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    security_question TEXT DEFAULT '',
                    security_answer_hash TEXT DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT NOW()::TEXT
                )
            """)
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    username TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    security_question TEXT DEFAULT '',
                    security_answer_hash TEXT DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
            """)


def register_user(email: str, username: str, password: str,
                   security_question: str = "", security_answer: str = "") -> int | None:
    """Register a new user. Returns user id or None if email already exists."""
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    answer_hash = ""
    if security_answer.strip():
        answer_hash = bcrypt.hashpw(security_answer.strip().lower().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    try:
        with _db() as conn:
            return _insert(conn,
                "INSERT INTO users (email, username, password_hash, security_question, security_answer_hash) VALUES (?, ?, ?, ?, ?)",
                (email.lower().strip(), username.strip(), password_hash, security_question, answer_hash))
    except Exception:
        return None


def authenticate_user(email: str, password: str) -> dict | None:
    """Authenticate a user. Returns user dict or None."""
    with _db() as conn:
        row = _exec(conn,
            "SELECT * FROM users WHERE email = ?", (email.lower().strip(),)
        ).fetchone()

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
    """Create user_api_keys table if it doesn't exist (no-op if init_db() already ran)."""
    with _db() as conn:
        if USE_POSTGRES:
            conn.cursor().execute("""
                CREATE TABLE IF NOT EXISTS user_api_keys (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    provider TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT NOW()::TEXT,
                    UNIQUE(user_id, provider)
                )
            """)
        else:
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


def save_api_key(user_id: int, provider: str, api_key: str) -> None:
    """Save or update an API key for a user+provider."""
    with _db() as conn:
        _exec(conn,
            """INSERT INTO user_api_keys (user_id, provider, api_key, updated_at)
               VALUES (?, ?, ?, datetime('now'))
               ON CONFLICT(user_id, provider) DO UPDATE SET
               api_key=excluded.api_key, updated_at=datetime('now')""",
            (user_id, provider, api_key))


def get_api_key(user_id: int, provider: str) -> str | None:
    """Get a user's API key for a specific provider."""
    with _db() as conn:
        row = _exec(conn,
            "SELECT api_key FROM user_api_keys WHERE user_id = ? AND provider = ?",
            (user_id, provider)).fetchone()
    return row["api_key"] if row else None


def delete_api_key(user_id: int, provider: str) -> None:
    """Delete a user's API key for a specific provider."""
    with _db() as conn:
        _exec(conn,
            "DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?",
            (user_id, provider))


def has_api_key(user_id: int, provider: str) -> bool:
    """Check if a user has an API key for a provider."""
    return get_api_key(user_id, provider) is not None


# ── Session Token Persistence (cookie-based) ──────────────────

def init_sessions_table() -> None:
    """Create session_tokens table if it doesn't exist (no-op if init_db() already ran)."""
    with _db() as conn:
        if USE_POSTGRES:
            conn.cursor().execute("""
                CREATE TABLE IF NOT EXISTS session_tokens (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL DEFAULT NOW()::TEXT
                )
            """)
        else:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS session_tokens (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)


def create_session_token(user_id: int) -> str:
    """Create a new session token for a user and store in DB."""
    token = uuid.uuid4().hex
    with _db() as conn:
        _exec(conn, "DELETE FROM session_tokens WHERE user_id = ?", (user_id,))
        _exec(conn,
            "INSERT INTO session_tokens (token, user_id) VALUES (?, ?)",
            (token, user_id))
    return token


def get_user_by_token(token: str) -> dict | None:
    """Look up a user by session token. Returns user dict or None."""
    with _db() as conn:
        row = _exec(conn,
            """SELECT u.id, u.email, u.username
               FROM session_tokens s JOIN users u ON s.user_id = u.id
               WHERE s.token = ?""",
            (token,)).fetchone()
    if row:
        return {"id": row["id"], "email": row["email"], "username": row["username"]}
    return None


def delete_session_token(user_id: int) -> None:
    """Delete all session tokens for a user (on logout)."""
    with _db() as conn:
        _exec(conn, "DELETE FROM session_tokens WHERE user_id = ?", (user_id,))


def set_session_cookie(token: str) -> None:
    """Inject JS to set a session cookie in the browser."""
    components.html(
        f"""<script>
        document.cookie = "chamber_session={token}; path=/; max-age=2592000; SameSite=Lax";
        </script>""",
        height=0,
    )


def clear_session_cookie() -> None:
    """Inject JS to clear the session cookie."""
    components.html(
        """<script>
        document.cookie = "chamber_session=; path=/; max-age=0; SameSite=Lax";
        </script>""",
        height=0,
    )


def try_cookie_login() -> bool:
    """Try to restore session from cookie. Returns True if successful."""
    if is_logged_in():
        return True
    try:
        cookies = st.context.cookies
        token = cookies.get("chamber_session")
        if token:
            user = get_user_by_token(token)
            if user:
                login_user(user)
                return True
    except Exception:
        pass
    return False


# ── Forgot Password (security question) ──────────────────────

SECURITY_QUESTIONS = [
    "What is the name of your first pet?",
    "What city were you born in?",
    "What was your first trading instrument?",
    "What is your mother's maiden name?",
]


def get_security_question(email: str) -> str | None:
    """Return the security question for an email, or None if not found."""
    with _db() as conn:
        row = _exec(conn,
            "SELECT security_question FROM users WHERE email = ?",
            (email.lower().strip(),)).fetchone()
    if row and row["security_question"]:
        return row["security_question"]
    return None


def verify_security_answer(email: str, answer: str) -> bool:
    """Check if the security answer matches."""
    with _db() as conn:
        row = _exec(conn,
            "SELECT security_answer_hash FROM users WHERE email = ?",
            (email.lower().strip(),)).fetchone()
    if not row or not row["security_answer_hash"]:
        return False
    return bcrypt.checkpw(answer.strip().lower().encode("utf-8"), row["security_answer_hash"].encode("utf-8"))


def reset_password(email: str, new_password: str) -> bool:
    """Update a user's password hash. Returns True on success."""
    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    with _db() as conn:
        _exec(conn,
            "UPDATE users SET password_hash = ? WHERE email = ?",
            (new_hash, email.lower().strip()))
    return True


def has_security_question(user_id: int) -> bool:
    """Check if a user has set up a security question."""
    with _db() as conn:
        row = _exec(conn,
            "SELECT security_question FROM users WHERE id = ?",
            (user_id,)).fetchone()
    return bool(row and row["security_question"])


def set_security_question(user_id: int, question: str, answer: str) -> None:
    """Set or update a user's security question and answer."""
    answer_hash = bcrypt.hashpw(answer.strip().lower().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    with _db() as conn:
        _exec(conn,
            "UPDATE users SET security_question = ?, security_answer_hash = ? WHERE id = ?",
            (question, answer_hash, user_id))
