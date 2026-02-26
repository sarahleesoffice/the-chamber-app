import os
import re
import time
from PIL import Image

from lib.database import USE_POSTGRES, save_chart_to_db, get_chart_from_db, delete_chart_from_db

PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
CHARTS_DIR = os.path.join(PROJECT_ROOT, "charts")

MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def ensure_charts_dir() -> None:
    os.makedirs(CHARTS_DIR, exist_ok=True)


def _safe_filename(name: str) -> str:
    name = os.path.basename(name)
    name = re.sub(r"[^\w.\-]", "_", name)
    return name.lower()


def save_chart(uploaded_file, trade_id: int, user_id: int = 1) -> str:
    """Save a chart image. Returns a path string (filesystem or db:// sentinel)."""
    # Validate it's a real image
    img = Image.open(uploaded_file)
    img.verify()
    uploaded_file.seek(0)

    if USE_POSTGRES:
        image_bytes = uploaded_file.read()
        mime_type = get_chart_mime_type(uploaded_file.name)
        save_chart_to_db(trade_id, uploaded_file.name, mime_type, image_bytes, user_id)
        return f"db://{trade_id}"

    # Local filesystem storage
    ensure_charts_dir()
    safe_name = _safe_filename(uploaded_file.name)
    timestamp = int(time.time())
    filename = f"{trade_id}_{timestamp}_{safe_name}"
    filepath = os.path.join(CHARTS_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(uploaded_file.read())

    return os.path.join("charts", filename)


def get_chart_absolute_path(relative_path: str) -> str:
    return os.path.join(PROJECT_ROOT, relative_path)


def load_chart_bytes(relative_path: str, user_id: int = 1) -> bytes | None:
    """Load chart image bytes from DB or filesystem."""
    if relative_path and relative_path.startswith("db://"):
        trade_id = int(relative_path.replace("db://", ""))
        result = get_chart_from_db(trade_id, user_id)
        return result["image_data"] if result else None

    try:
        abs_path = get_chart_absolute_path(relative_path)
        with open(abs_path, "rb") as f:
            return f.read()
    except (OSError, TypeError):
        return None


def get_chart_mime_type(path_or_name: str) -> str:
    if path_or_name and path_or_name.startswith("db://"):
        return "image/png"  # default; actual mime stored in DB
    ext = os.path.splitext(path_or_name)[1].lower()
    return MIME_TYPES.get(ext, "image/png")
