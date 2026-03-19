-- Gamma cards and Discord references for enriched AI responses

-- 1. Gamma study cards/slides
CREATE TABLE IF NOT EXISTS public.gamma_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,  -- e.g. 'Market Structure', 'Order Blocks', 'Liquidity'
  slide_number INTEGER,
  deck_name TEXT,  -- e.g. 'ICT Core Concepts', 'Kill Zones Deep Dive'
  gamma_url TEXT,  -- link to the Gamma presentation
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gamma_cards_category_idx ON public.gamma_cards (category);
CREATE INDEX IF NOT EXISTS gamma_cards_tags_idx ON public.gamma_cards USING GIN (tags);

-- 2. Discord thread references
CREATE TABLE IF NOT EXISTS public.discord_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept TEXT NOT NULL,  -- ICT concept name e.g. 'Order Blocks', 'Fair Value Gap'
  thread_title TEXT,
  thread_url TEXT NOT NULL,  -- Discord thread URL
  channel_name TEXT,  -- e.g. '#ict-concepts', '#trade-analysis'
  description TEXT,  -- brief description of what's discussed
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS discord_refs_concept_idx ON public.discord_references (concept);
CREATE INDEX IF NOT EXISTS discord_refs_tags_idx ON public.discord_references USING GIN (tags);

-- RLS: all authenticated users can read
ALTER TABLE public.gamma_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discord_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read gamma cards"
  ON public.gamma_cards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read discord references"
  ON public.discord_references FOR SELECT TO authenticated USING (true);

-- Admin only write (service_role bypasses RLS)
CREATE POLICY "Users cannot insert gamma cards"
  ON public.gamma_cards FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "Users cannot insert discord references"
  ON public.discord_references FOR INSERT TO authenticated WITH CHECK (false);
