"""
Export ChromaDB chunks to JSON for import into Supabase.
Run from the Streamlit app directory:

    cd "/Users/sarajuana/ict mentor bot"
    python3 "/Users/sarajuana/chamber-app/scripts/export-chromadb.py"

This creates: /Users/sarajuana/chamber-app/scripts/chromadb_export.json
"""

import json
import os
import sys

# Add the streamlit app to path so we can import its modules
sys.path.insert(0, "/Users/sarajuana/ict mentor bot")

try:
    import chromadb
except ImportError:
    print("chromadb not installed. Run: pip3 install chromadb")
    sys.exit(1)

# Connect to the ChromaDB
db_path = "/Users/sarajuana/ict mentor bot/knowledge_base/chromadb"
if not os.path.exists(db_path):
    print(f"ChromaDB not found at {db_path}")
    sys.exit(1)

print(f"Opening ChromaDB at {db_path}...")
client = chromadb.PersistentClient(path=db_path)

# List collections
collections = client.list_collections()
print(f"Found {len(collections)} collections")

all_chunks = []

for coll in collections:
    print(f"\nCollection: {coll.name}")

    # Get all documents
    results = coll.get(
        include=["documents", "metadatas", "embeddings"]
    )

    docs = results.get("documents", [])
    metas = results.get("metadatas", [])
    embeddings = results.get("embeddings", [])
    ids = results.get("ids", [])

    print(f"  Documents: {len(docs)}")

    for i, doc in enumerate(docs):
        meta = metas[i] if i < len(metas) else {}
        embedding = embeddings[i] if embeddings is not None and len(embeddings) > i else None

        chunk = {
            "content": doc,
            "source_video": meta.get("source", meta.get("title", meta.get("video_title", ""))),
            "source_url": meta.get("url", meta.get("video_url", "")),
            "tags": [],
            "chunk_index": meta.get("chunk_index", i),
        }

        # Extract tags from metadata
        if meta.get("tags"):
            if isinstance(meta["tags"], str):
                chunk["tags"] = [t.strip() for t in meta["tags"].split(",")]
            elif isinstance(meta["tags"], list):
                chunk["tags"] = meta["tags"]

        # Include embedding if available (384 dims for all-MiniLM-L6-v2)
        if embedding is not None:
            chunk["embedding"] = list(embedding)

        all_chunks.append(chunk)

output_path = "/Users/sarajuana/chamber-app/scripts/chromadb_export.json"
with open(output_path, "w") as f:
    json.dump(all_chunks, f)

print(f"\n✅ Exported {len(all_chunks)} chunks to {output_path}")
print(f"File size: {os.path.getsize(output_path) / 1024 / 1024:.1f} MB")
print(f"\nNext step: cd /Users/sarajuana/chamber-app && npx tsx scripts/import-knowledge.ts")
