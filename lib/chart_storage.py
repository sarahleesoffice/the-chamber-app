import os
import re
import time
from PIL import Image

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


def save_chart(uploaded_file, trade_id: int) -> str:
    ensure_charts_dir()
    # Validate it's a real image
    img = Image.open(uploaded_file)
    img.verify()
    uploaded_file.seek(0)

    safe_name = _safe_filename(uploaded_file.name)
    timestamp = int(time.time())
    filename = f"{trade_id}_{timestamp}_{safe_name}"
    filepath = os.path.join(CHARTS_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(uploaded_file.read())

    return os.path.join("charts", filename)


def get_chart_absolute_path(relative_path: str) -> str:
    return os.path.join(PROJECT_ROOT, relative_path)


def load_chart_bytes(relative_path: str) -> bytes:
    abs_path = get_chart_absolute_path(relative_path)
    with open(abs_path, "rb") as f:
        return f.read()


def get_chart_mime_type(relative_path: str) -> str:
    ext = os.path.splitext(relative_path)[1].lower()
    return MIME_TYPES.get(ext, "image/png")
