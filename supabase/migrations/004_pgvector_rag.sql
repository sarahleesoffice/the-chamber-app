-- pgvector RAG: Knowledge Base with semantic search
-- Requires the pgvector extension (available on all Supabase plans)

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Knowledge chunks table
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = shared/system data
  content TEXT NOT NULL,
  embedding vector(384),  -- sentence-transformers all-MiniLM-L6-v2 = 384 dims
  source_video TEXT,
  source_url TEXT,
  tags TEXT[],
  chunk_index INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. IVFFlat index for fast similarity search
-- NOTE: IVFFlat requires rows to exist before creating the index.
-- After initial data import, run: CREATE INDEX ... (see below).
-- For small datasets (<10k rows) an exact search index works fine:
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 20);

-- Additional indexes for filtering
CREATE INDEX IF NOT EXISTS knowledge_chunks_user_id_idx
  ON public.knowledge_chunks (user_id);

CREATE INDEX IF NOT EXISTS knowledge_chunks_tags_idx
  ON public.knowledge_chunks
  USING GIN (tags);

CREATE INDEX IF NOT EXISTS knowledge_chunks_source_video_idx
  ON public.knowledge_chunks (source_video);

-- 4. RPC function for similarity search
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(384),
  match_count INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_video TEXT,
  source_url TEXT,
  tags TEXT[],
  chunk_index INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.source_video,
    kc.source_url,
    kc.tags,
    kc.chunk_index,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 5. RPC function for keyword/text search fallback (no embeddings needed)
CREATE OR REPLACE FUNCTION public.search_knowledge_text(
  search_query TEXT,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_video TEXT,
  source_url TEXT,
  tags TEXT[],
  chunk_index INTEGER,
  rank FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.content,
    kc.source_video,
    kc.source_url,
    kc.tags,
    kc.chunk_index,
    ts_rank_cd(
      to_tsvector('english', kc.content || ' ' || COALESCE(kc.source_video, '') || ' ' || COALESCE(array_to_string(kc.tags, ' '), '')),
      plainto_tsquery('english', search_query)
    )::FLOAT AS rank
  FROM public.knowledge_chunks kc
  WHERE
    to_tsvector('english', kc.content || ' ' || COALESCE(kc.source_video, '') || ' ' || COALESCE(array_to_string(kc.tags, ' '), ''))
    @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT match_count;
END;
$$;

-- 6. Full-text search index for the keyword fallback
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx
  ON public.knowledge_chunks
  USING GIN (
    to_tsvector('english', content || ' ' || COALESCE(source_video, '') || ' ' || COALESCE(array_to_string(tags, ' '), ''))
  );

-- 7. RLS policies
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the shared knowledge base
CREATE POLICY "Authenticated users can read knowledge chunks"
  ON public.knowledge_chunks
  FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role can insert/update/delete (admin import only)
-- Note: service_role bypasses RLS by default, so no explicit policy needed.
-- But we add restrictive policies for other roles:
CREATE POLICY "Users cannot insert knowledge chunks"
  ON public.knowledge_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Users cannot update knowledge chunks"
  ON public.knowledge_chunks
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Users cannot delete knowledge chunks"
  ON public.knowledge_chunks
  FOR DELETE
  TO authenticated
  USING (false);
