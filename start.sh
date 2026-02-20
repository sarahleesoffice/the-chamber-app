#!/bin/bash
# Startup script: index knowledge base if needed, then run Streamlit

echo "=== The Chamber — Starting up ==="

# Check if knowledge base is already indexed
CHUNK_COUNT=$(python3 -c "
from lib.knowledge.vector_store import get_collection_stats
stats = get_collection_stats()
print(stats['total_chunks'])
" 2>/dev/null || echo "0")

if [ "$CHUNK_COUNT" = "0" ]; then
    echo "Knowledge base not indexed yet. Building index..."
    python3 -c "
import sys, time
from pathlib import Path
from lib.knowledge.transcript_parser import parse_all_transcripts
from lib.knowledge.chunker import chunk_all_transcripts
from lib.knowledge.vector_store import index_chunks

transcript_dir = Path('knowledge_base/transcripts')
if not transcript_dir.exists():
    print('No transcripts found — skipping indexing.')
    sys.exit(0)

print('Parsing transcripts...')
transcripts = parse_all_transcripts(str(transcript_dir))
print(f'Parsed {len(transcripts)} transcripts')

print('Chunking...')
chunks = chunk_all_transcripts(transcripts, target_words=750, overlap_words=100)
print(f'Created {len(chunks)} chunks')

print('Embedding and indexing (this takes a few minutes)...')
indexed = index_chunks(chunks, batch_size=100)
print(f'Done! Indexed {indexed} chunks.')
"
    echo "Knowledge base ready."
else
    echo "Knowledge base already indexed: $CHUNK_COUNT chunks"
fi

echo "Starting Streamlit..."
exec streamlit run app.py \
    --server.port=8501 \
    --server.address=0.0.0.0 \
    --server.headless=true \
    --browser.gatherUsageStats=false
