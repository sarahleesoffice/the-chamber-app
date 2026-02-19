"""
One-time script to index all ICT transcripts into ChromaDB.

Parses transcripts -> chunks them -> embeds -> stores in ChromaDB.
Run this once after placing transcripts in knowledge_base/transcripts/.

Usage:
    python3 -m scripts.index_knowledge_base
"""

import sys
import time
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.knowledge.transcript_parser import parse_all_transcripts
from lib.knowledge.chunker import chunk_all_transcripts
from lib.knowledge.vector_store import index_chunks, get_collection_stats, clear_collection


def main():
    transcript_dir = Path(__file__).resolve().parent.parent / "knowledge_base" / "transcripts"

    if not transcript_dir.exists():
        print(f"Transcript directory not found: {transcript_dir}")
        sys.exit(1)

    print("=" * 60)
    print("ICT Knowledge Base Indexer")
    print("=" * 60)

    # Check if already indexed
    stats = get_collection_stats()
    if stats["total_chunks"] > 0:
        print(f"\nExisting index found: {stats['total_chunks']} chunks")
        response = input("Re-index from scratch? (y/N): ").strip().lower()
        if response == "y":
            print("Clearing existing index...")
            clear_collection()
        else:
            print("Keeping existing index. Done.")
            return

    # Step 1: Parse transcripts
    print(f"\n[1/3] Parsing transcripts from {transcript_dir}...")
    start = time.time()
    transcripts = parse_all_transcripts(str(transcript_dir))
    parse_time = time.time() - start
    print(f"  Parsed {len(transcripts)} transcripts in {parse_time:.1f}s")

    if not transcripts:
        print("No transcripts found. Exiting.")
        sys.exit(1)

    # Step 2: Chunk transcripts
    print("\n[2/3] Chunking transcripts (750 words, 100 overlap)...")
    start = time.time()
    chunks = chunk_all_transcripts(transcripts, target_words=750, overlap_words=100)
    chunk_time = time.time() - start
    print(f"  Created {len(chunks)} chunks in {chunk_time:.1f}s")

    tagged = sum(1 for c in chunks if c.concept_tags)
    print(f"  {tagged}/{len(chunks)} chunks tagged with ICT concepts ({100*tagged//len(chunks)}%)")

    # Step 3: Embed and index
    print(f"\n[3/3] Embedding and indexing {len(chunks)} chunks into ChromaDB...")
    print("  (First run will download the embedding model ~80MB)")
    start = time.time()
    indexed = index_chunks(chunks, batch_size=100)
    index_time = time.time() - start
    print(f"  Indexed {indexed} chunks in {index_time:.1f}s")

    # Summary
    final_stats = get_collection_stats()
    print("\n" + "=" * 60)
    print("Indexing complete!")
    print(f"  Total chunks in DB: {final_stats['total_chunks']}")
    print(f"  DB path: {final_stats['db_path']}")
    print(f"  Total time: {parse_time + chunk_time + index_time:.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
