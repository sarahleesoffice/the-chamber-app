-- Fast full-text search over the SMC lecture transcripts (knowledge_chunks).
--
-- The index from 004 was on an expression using array_to_string(), which
-- Postgres doesn't allow in an index (not IMMUTABLE), so it was never built:
-- every search_knowledge_text call scanned and re-parsed all ~20k chunks and
-- took 6-10s, often hitting the statement timeout. This stores the parsed
-- text in an indexed column instead.

-- array_to_string() is only STABLE because of generic element output; for a
-- text[] the result never changes, so this wrapper is safe to mark IMMUTABLE.
CREATE OR REPLACE FUNCTION public.knowledge_search_document(content TEXT, source_video TEXT, tags TEXT[])
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_tsvector(
    'english'::regconfig,
    COALESCE(content, '') || ' ' || COALESCE(source_video, '') || ' ' || COALESCE(array_to_string(tags, ' '), '')
  )
$$;

ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (public.knowledge_search_document(content, source_video, tags)) STORED;

CREATE INDEX IF NOT EXISTS knowledge_chunks_search_tsv_idx
  ON public.knowledge_chunks USING GIN (search_tsv);

DROP INDEX IF EXISTS public.knowledge_chunks_fts_idx;

-- Same signature and results as before, now served by the index.
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
LANGUAGE sql
STABLE
AS $$
  SELECT
    kc.id,
    kc.content,
    kc.source_video,
    kc.source_url,
    kc.tags,
    kc.chunk_index,
    ts_rank_cd(kc.search_tsv, plainto_tsquery('english', search_query))::FLOAT AS rank
  FROM public.knowledge_chunks kc
  WHERE kc.search_tsv @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT match_count;
$$;

ANALYZE public.knowledge_chunks;
