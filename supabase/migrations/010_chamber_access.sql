-- Chamber paywall: who gets into the app.
--
-- Access is granted by any of:
--   * an admin account (ADMIN_EMAILS / ADMIN_USER_IDS env, see lib/admin.ts)
--   * an email on lifetime_access — free-for-life friends, managed on /admin/members
--   * a linked Whop account with a valid membership to The Chamber
--
-- whop_links ties a Chamber login to a Whop user (set by "Connect Whop" OAuth).
-- whop_access caches Whop's "does this user have access" answer per Whop user;
-- it is written by the webhook, on connect, and re-checked when it gets stale.
-- whop_webhook_events makes webhook delivery idempotent (Whop retries).
--
-- All four tables are server-only: RLS on, no policies, browser roles revoked.
-- profiles.subscription_status is NOT used for access — users can update their
-- own profile row, so it can't be trusted for gating.

CREATE TABLE IF NOT EXISTS public.lifetime_access (
  email text PRIMARY KEY CHECK (email = lower(email)),
  note text NOT NULL DEFAULT '',
  granted_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whop_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  whop_user_id text NOT NULL UNIQUE,
  whop_username text,
  whop_email text,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whop_access (
  whop_user_id text PRIMARY KEY,
  has_access boolean NOT NULL DEFAULT false,  -- Whop's own check-access answer for WHOP_PRODUCT_ID
  status text,                                 -- latest membership status seen (trialing, active, past_due, ...)
  membership_id text,
  product_id text,
  current_period_end timestamptz,
  email text,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whop_webhook_events (
  id text PRIMARY KEY,
  type text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lifetime_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whop_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whop_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whop_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.lifetime_access FROM anon, authenticated;
REVOKE ALL ON public.whop_links FROM anon, authenticated;
REVOKE ALL ON public.whop_access FROM anon, authenticated;
REVOKE ALL ON public.whop_webhook_events FROM anon, authenticated;
