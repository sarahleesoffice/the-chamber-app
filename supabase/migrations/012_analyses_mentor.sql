-- Which mentor (ember / amber / ash) wrote each AI Analysis.
-- Metadata-only change: ADD COLUMN with no default and no NOT NULL doesn't
-- rewrite the table or take a long lock (and analyses has ~20 rows).
ALTER TABLE public.analyses ADD COLUMN IF NOT EXISTS mentor TEXT;
