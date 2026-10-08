-- Risk + timing fields for trades, filled by broker imports (FTMO/MT5).
-- All nullable: manually logged and older trades simply don't have them.
--
-- open_time / close_time are broker SERVER time as exported (no time zone),
-- the same clock the broker's daily P&L uses.
-- risk_dollar is derived at import from the trade's own numbers:
--   |entry - stop_loss| × (|gross profit| / |exit - entry|)
-- so no contract specs are needed. NULL when there was no stop, or the stop
-- had been trailed to breakeven or into profit (risk no longer known).

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS lot_size DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS stop_loss DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS take_profit DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS open_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS close_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS risk_dollar DOUBLE PRECISION;
