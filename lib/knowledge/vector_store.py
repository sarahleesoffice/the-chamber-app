"""
ChromaDB vector store for ICT knowledge chunks.

Stores embedded transcript chunks with metadata for RAG retrieval.
"""

import chromadb
from pathlib import Path

from lib.knowledge.chunker import Chunk
from lib.knowledge.embeddings import embed_texts, embed_query

# Persistent storage path
DB_PATH = Path(__file__).resolve().parent.parent.parent / "knowledge_base" / "chromadb"
COLLECTION_NAME = "ict_chunks"


def get_client() -> chromadb.ClientAPI:
    """Get a persistent ChromaDB client."""
    DB_PATH.mkdir(parents=True, exist_ok=True)
    return chromadb.PersistentClient(path=str(DB_PATH))


def get_collection(client: chromadb.ClientAPI | None = None) -> chromadb.Collection:
    """Get or create the ICT chunks collection."""
    if client is None:
        client = get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def index_chunks(chunks: list[Chunk], batch_size: int = 100) -> int:
    """
    Embed and store chunks in ChromaDB.

    Returns the number of chunks indexed.
    """
    if not chunks:
        return 0

    collection = get_collection()
    total_indexed = 0

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i : i + batch_size]

        ids = [c.chunk_id for c in batch]
        texts = [c.text for c in batch]
        metadatas = [
            {
                "video_id": c.video_id,
                "video_title": c.video_title,
                "video_url": c.video_url,
                "playlist": c.playlist,
                "chunk_index": c.chunk_index,
                "word_count": c.word_count,
                "concept_tags": ",".join(c.concept_tags),
            }
            for c in batch
        ]

        embeddings = embed_texts(texts)

        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metadatas,
        )

        total_indexed += len(batch)
        print(f"  Indexed {total_indexed}/{len(chunks)} chunks...")

    return total_indexed


def query_similar(
    query: str,
    n_results: int = 5,
    concept_filter: str | None = None,
) -> list[dict]:
    """
    Find the most relevant ICT teaching chunks for a query.

    Args:
        query: The search query (e.g., trade reasoning or concept name).
        n_results: Number of results to return.
        concept_filter: Optional concept tag to filter by (e.g., "Order Block").

    Returns:
        List of dicts with keys: text, video_title, video_url, concept_tags, distance
    """
    collection = get_collection()

    query_embedding = embed_query(query)

    where_filter = None
    if concept_filter:
        where_filter = {"concept_tags": {"$contains": concept_filter}}

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results,
        where=where_filter,
        include=["documents", "metadatas", "distances"],
    )

    output = []
    if results["documents"] and results["documents"][0]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            output.append({
                "text": doc,
                "video_title": meta["video_title"],
                "video_url": meta["video_url"],
                "concept_tags": meta["concept_tags"].split(",") if meta["concept_tags"] else [],
                "distance": dist,
            })

    return output


def get_collection_stats() -> dict:
    """Get stats about the indexed collection."""
    try:
        collection = get_collection()
        count = collection.count()
        return {
            "total_chunks": count,
            "collection_name": COLLECTION_NAME,
            "db_path": str(DB_PATH),
        }
    except Exception:
        return {
            "total_chunks": 0,
            "collection_name": COLLECTION_NAME,
            "db_path": str(DB_PATH),
        }


def get_all_metadata(limit: int = 5000) -> list[dict]:
    """Get metadata for all chunks in the collection."""
    try:
        collection = get_collection()
        count = collection.count()
        if count == 0:
            return []
        results = collection.get(
            limit=min(count, limit),
            include=["metadatas"],
        )
        return results["metadatas"] if results["metadatas"] else []
    except Exception:
        return []


def clear_collection() -> None:
    """Delete all data from the collection (for re-indexing)."""
    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except ValueError:
        pass  # Collection doesn't exist
