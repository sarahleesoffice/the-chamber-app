-- Free SMC lessons opt-in (/free): people who traded their email for the
-- free Discord lessons, plus where they are in the follow-up email series.
--
-- Written only by the server (service role): /api/free/signup adds a row and
-- sends the welcome email, the daily cron (/api/free/cron) sends the next
-- email in the series, /api/free/unsubscribe stops it.

CREATE TABLE IF NOT EXISTS public.free_leads (
  email text PRIMARY KEY CHECK (email = lower(email)),
  source text NOT NULL DEFAULT 'site',            -- ig, tiktok, clip, site, ...
  unsubscribe_token text NOT NULL UNIQUE,
  welcome_sent_at timestamptz,
  sequence_step int NOT NULL DEFAULT 0,           -- follow-up emails sent so far
  next_email_at timestamptz,                      -- null = series finished or stopped
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS free_leads_due_idx
  ON public.free_leads (next_email_at)
  WHERE next_email_at IS NOT NULL AND unsubscribed_at IS NULL;

ALTER TABLE public.free_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.free_leads FROM anon, authenticated;
