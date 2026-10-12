-- Model gateway, phases 4–5 (Mac mini fleet).
--
-- message_tags: one row per member message, written nightly by the mini's
-- question_tagger.py (Claude Haiku 5.5). Topic / difficulty / best agent feed
-- the admin "What people ask" page and the routing rules. Server-only: RLS on,
-- no policies, browser roles revoked — only the service role reads or writes.
--
-- llm_calls.route_*: the router's decision for each call. In shadow mode the
-- call still runs on the original model and route_model / route_cost_usd record
-- what it WOULD have used and cost, so savings can be checked before switching.

CREATE TABLE IF NOT EXISTS public.message_tags (
  message_id uuid PRIMARY KEY,           -- agent_conversations.id
  bot_name text NOT NULL,
  user_id text,
  is_owner boolean NOT NULL DEFAULT false,
  channel_kind text NOT NULL,            -- web | discord | other
  asked_at timestamptz NOT NULL,
  topic text NOT NULL,
  difficulty text NOT NULL,
  best_agent text NOT NULL,
  needs_live_data boolean NOT NULL DEFAULT false,
  summary text,
  model text,
  tagged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_tags_asked_at ON public.message_tags (asked_at);

ALTER TABLE public.message_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_tags FROM anon, authenticated;

ALTER TABLE public.llm_calls
  ADD COLUMN IF NOT EXISTS route_model text,
  ADD COLUMN IF NOT EXISTS route_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS route_reason text,
  ADD COLUMN IF NOT EXISTS provider text;
