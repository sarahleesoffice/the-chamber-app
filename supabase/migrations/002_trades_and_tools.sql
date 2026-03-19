-- ============================================================
-- Phase 1: Trades, analyses, watchlist, playbook, API keys
-- Run in Supabase SQL Editor
-- ============================================================

-- Trades table
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price DOUBLE PRECISION NOT NULL,
  exit_price DOUBLE PRECISION NOT NULL,
  pnl_pips DOUBLE PRECISION NOT NULL DEFAULT 0,
  pnl_dollar DOUBLE PRECISION,
  trade_date DATE NOT NULL,
  reasoning TEXT DEFAULT '',
  chart_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Analyses table
CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  analysis_text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Watchlist table
CREATE TABLE IF NOT EXISTS public.watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pair TEXT NOT NULL,
  bias TEXT DEFAULT 'neutral' CHECK (bias IN ('bullish', 'bearish', 'neutral')),
  timeframe TEXT DEFAULT '',
  key_levels TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  setup_type TEXT DEFAULT '',
  alert_price DOUBLE PRECISION,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Playbook setups table
CREATE TABLE IF NOT EXISTS public.playbook_setups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  setup_type TEXT DEFAULT '',
  rules TEXT DEFAULT '',
  description TEXT DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trade grades table
CREATE TABLE IF NOT EXISTS public.trade_grades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE NOT NULL,
  playbook_id UUID REFERENCES public.playbook_setups(id) ON DELETE CASCADE NOT NULL,
  rules_followed TEXT DEFAULT '',
  rules_broken TEXT DEFAULT '',
  compliance_pct DOUBLE PRECISION DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User API keys (encrypted at app layer)
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Journal entries table (full version with all fields)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  journal_date DATE NOT NULL,
  sleep INTEGER NOT NULL DEFAULT 5,
  energy INTEGER NOT NULL DEFAULT 5,
  focus INTEGER NOT NULL DEFAULT 5,
  mood INTEGER NOT NULL DEFAULT 5,
  stress INTEGER NOT NULL DEFAULT 5,
  confidence INTEGER NOT NULL DEFAULT 5,
  readiness_score INTEGER NOT NULL DEFAULT 5,
  readiness_label TEXT DEFAULT '',
  emotional_states JSONB DEFAULT '[]',
  mistakes JSONB DEFAULT '[]',
  ict_setups_used JSONB DEFAULT '[]',
  market_condition TEXT DEFAULT '',
  reflection TEXT DEFAULT '',
  lessons_learned TEXT DEFAULT '',
  tomorrows_improvements TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, journal_date)
);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own journal" ON public.journal_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own journal" ON public.journal_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own journal" ON public.journal_entries
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own journal" ON public.journal_entries
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_journal_user_date ON public.journal_entries(user_id, journal_date);

-- ============================================================
-- Triggers (auto-update updated_at)
-- ============================================================

CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_watchlist_updated_at
  BEFORE UPDATE ON public.watchlist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_playbook_setups_updated_at
  BEFORE UPDATE ON public.playbook_setups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- Trades RLS
CREATE POLICY "Users can view own trades" ON public.trades
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON public.trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON public.trades
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trades" ON public.trades
  FOR DELETE USING (auth.uid() = user_id);

-- Analyses RLS
CREATE POLICY "Users can view own analyses" ON public.analyses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON public.analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own analyses" ON public.analyses
  FOR DELETE USING (auth.uid() = user_id);

-- Watchlist RLS
CREATE POLICY "Users can view own watchlist" ON public.watchlist
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own watchlist" ON public.watchlist
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own watchlist" ON public.watchlist
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own watchlist" ON public.watchlist
  FOR DELETE USING (auth.uid() = user_id);

-- Playbook RLS
CREATE POLICY "Users can view own playbooks" ON public.playbook_setups
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own playbooks" ON public.playbook_setups
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own playbooks" ON public.playbook_setups
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own playbooks" ON public.playbook_setups
  FOR DELETE USING (auth.uid() = user_id);

-- Trade grades RLS
CREATE POLICY "Users can view own grades" ON public.trade_grades
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own grades" ON public.trade_grades
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own grades" ON public.trade_grades
  FOR DELETE USING (auth.uid() = user_id);

-- API keys RLS
CREATE POLICY "Users can view own keys" ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own keys" ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own keys" ON public.user_api_keys
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own keys" ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trades_user_date ON public.trades(user_id, trade_date);
CREATE INDEX IF NOT EXISTS idx_trades_user_pair ON public.trades(user_id, pair);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON public.analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_trade ON public.analyses(trade_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_active ON public.watchlist(user_id, active);
CREATE INDEX IF NOT EXISTS idx_playbook_user_active ON public.playbook_setups(user_id, active);
CREATE INDEX IF NOT EXISTS idx_trade_grades_trade ON public.trade_grades(trade_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_provider ON public.user_api_keys(user_id, provider);

-- ============================================================
-- Storage bucket for chart images
-- ============================================================
-- NOTE: Create the 'trade-charts' bucket in Supabase Dashboard > Storage
-- Set it as private, then add these policies:
--
-- SELECT policy: auth.uid()::text = (storage.foldername(name))[1]
-- INSERT policy: auth.uid()::text = (storage.foldername(name))[1]
-- DELETE policy: auth.uid()::text = (storage.foldername(name))[1]
--
-- This ensures users can only access files in their own folder ({user_id}/*)
