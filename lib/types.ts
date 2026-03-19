// ============================================================
// Database types for The Chamber App
// ============================================================

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  subscription_status: "active" | "trialing" | "canceled" | "none";
  stripe_customer_id?: string;
  created_at: string;
}

export interface JournalEntry {
  id?: string;
  user_id: string;
  journal_date: string;
  sleep: number;
  energy: number;
  focus: number;
  mood: number;
  stress: number;
  confidence: number;
  readiness_score: number;
  readiness_label: string;
  emotional_states: string[];
  mistakes: string[];
  ict_setups_used?: string[];
  market_condition?: string;
  reflection: string;
  lessons_learned: string;
  tomorrows_improvements: string;
  created_at?: string;
  updated_at?: string;
}

export interface Trade {
  id?: string;
  user_id: string;
  pair: string;
  direction: "long" | "short";
  entry_price: number;
  exit_price: number;
  pnl_pips: number;
  pnl_dollar?: number | null;
  trade_date: string;
  reasoning: string;
  chart_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Analysis {
  id?: string;
  user_id: string;
  trade_id?: string | null;
  provider: string;
  model: string;
  analysis_text: string;
  created_at?: string;
}

export interface WatchlistItem {
  id?: string;
  user_id: string;
  pair: string;
  bias: "bullish" | "bearish" | "neutral";
  timeframe: string;
  key_levels: string;
  notes: string;
  setup_type: string;
  alert_price?: number | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PlaybookSetup {
  id?: string;
  user_id: string;
  name: string;
  setup_type: string;
  rules: string;
  description: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TradeGrade {
  id?: string;
  user_id: string;
  trade_id: string;
  playbook_id: string;
  rules_followed: string;
  rules_broken: string;
  compliance_pct: number;
  notes: string;
  created_at?: string;
}

export interface KnowledgeChunk {
  id: string;
  content: string;
  source_video: string | null;
  source_url: string | null;
  tags: string[] | null;
  chunk_index: number | null;
  similarity?: number;
  rank?: number;
}

export interface TradeStats {
  total_trades: number;
  win_rate: number;
  total_pips: number;
  total_dollar: number;
  avg_win_dollar: number;
  avg_loss_dollar: number;
  profit_factor: number;
  max_drawdown: number;
  rr_ratio: number;
  winners: number;
  losers: number;
  trading_days: number;
  winning_days: number;
  losing_days: number;
}
