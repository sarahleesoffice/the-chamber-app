"""
Embedding generator for ICT knowledge chunks.

Uses sentence-transformers to create embeddings that work
consistently regardless of which AI provider (Claude/Gemini)
the user selects for analysis.
"""

from sentence_transformers import SentenceTransformer

# Model is small (~80MB), fast, and produces quality embeddings
MODEL_NAME = "all-MiniLM-L6-v2"

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    """Lazy-load the embedding model (cached after first call)."""
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    model = get_model()
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=64)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    """Generate embedding for a single query string."""
    model = get_model()
    return model.encode(query).tolist()
