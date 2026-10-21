-- Fast full-text search over the SMC lecture transcripts (knowledge_chunks).
--
-- The index from 004 was on an expression using array_to_string(), which
-- Postgres won't index (not IMMUTABLE), so it was never built: every
-- search_knowledge_text call scanned and re-parsed all ~20k chunks (6-10s,
-- often hitting the statement timeout).
--
-- LOCK-FREE BY DESIGN. An earlier version of this file used a STORED
-- generated column, which rewrites the whole table under an exclusive lock;
-- on a throttled disk that held every reader (chats, imports, then the app's
-- auth checks) for many minutes. This version never takes a long lock:
--
--   step 1  add a plain nullable column (metadata only, instant)
--   step 2  trigger keeps it current for new/changed rows (instant)
--   step 3  backfill in small batches, each its own short transaction
--   step 4  CREATE INDEX CONCURRENTLY  (builds alongside live traffic)
--   step 5  switch the search function to the indexed column
--
-- Run the steps IN ORDER, each as its own statement (not in one transaction:
-- CREATE INDEX CONCURRENTLY refuses to run inside one). Until step 5 runs,
-- search_knowledge_text keeps working exactly as before. The total disk work
-- is the same as before but spread out, so nothing waits behind it.

-- ───────── step 1: parser + column ─────────

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

ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- ───────── step 2: keep it current ─────────

CREATE OR REPLACE FUNCTION public.knowledge_chunks_set_search_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_tsv := public.knowledge_search_document(NEW.content, NEW.source_video, NEW.tags);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_chunks_search_tsv ON public.knowledge_chunks;
CREATE TRIGGER knowledge_chunks_search_tsv
  BEFORE INSERT OR UPDATE OF content, source_video, tags ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.knowledge_chunks_set_search_tsv();

-- ───────── step 3: backfill in batches ─────────
-- Each call fills up to `batch` rows and returns how many it did. Run it
-- repeatedly until it returns 0 (~20k rows / 500 = ~40 calls). Each call is a
-- short transaction, so readers never queue behind it.
--   SELECT public.knowledge_chunks_backfill_search_tsv(500);

CREATE OR REPLACE FUNCTION public.knowledge_chunks_backfill_search_tsv(batch INTEGER DEFAULT 500)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  n INTEGER;
BEGIN
  WITH todo AS (
    SELECT id FROM public.knowledge_chunks
    WHERE search_tsv IS NULL
    LIMIT batch
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.knowledge_chunks kc
  SET search_tsv = public.knowledge_search_document(kc.content, kc.source_video, kc.tags)
  FROM todo WHERE kc.id = todo.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ───────── step 4: index, built without blocking anyone ─────────
-- Run this ONE statement by itself (outside any transaction).

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS knowledge_chunks_search_tsv_idx
--   ON public.knowledge_chunks USING GIN (search_tsv);

-- ───────── step 5: switch the search over (after steps 3 and 4 finish) ─────────
-- Same signature and results as before, now served by the index.

-- CREATE OR REPLACE FUNCTION public.search_knowledge_text(
--   search_query TEXT,
--   match_count INTEGER DEFAULT 5
-- )
-- RETURNS TABLE (
--   id UUID, content TEXT, source_video TEXT, source_url TEXT, tags TEXT[], chunk_index INTEGER, rank FLOAT
-- )
-- LANGUAGE sql
-- STABLE
-- AS $$
--   SELECT kc.id, kc.content, kc.source_video, kc.source_url, kc.tags, kc.chunk_index,
--          ts_rank_cd(kc.search_tsv, plainto_tsquery('english', search_query))::FLOAT AS rank
--   FROM public.knowledge_chunks kc
--   WHERE kc.search_tsv @@ plainto_tsquery('english', search_query)
--   ORDER BY rank DESC
--   LIMIT match_count;
-- $$;
--
-- DROP INDEX IF EXISTS public.knowledge_chunks_fts_idx;  -- the never-built one from 004
-- ANALYZE public.knowledge_chunks;
