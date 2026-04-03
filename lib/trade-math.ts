/**
 * Trade math utilities — ported from The Chamber's lib/trade_math.py
 */

export const COMMON_PAIRS = [
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD",
  "EUR/GBP", "EUR/JPY", "GBP/JPY", "AUD/JPY", "NZD/JPY", "CHF/JPY",
  "XAU/USD", "XAG/USD",
  "US100", "US30", "US500", "US100.SIM",
  "NAS100", "SPX500", "DJ30",
  "NQ", "ES", "YM",
  "BTC/USD", "ETH/USD",
];

const JPY_PAIRS = new Set([
  "USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY", "NZD/JPY", "CHF/JPY", "CAD/JPY",
]);

const INDEX_PAIRS = new Set([
  "US100", "US30", "US500", "NAS100", "SPX500", "DJ30",
  "US100.SIM", "US30.SIM", "US500.SIM",
  "NQ", "ES", "YM",
]);

/**
 * Get pip multiplier for a pair.
 * Standard forex: 10000, JPY pairs: 100, Indices: 1, Gold: 10
 */
export function getPipMultiplier(pair: string): number {
  const upper = pair.toUpperCase().replace(/\s/g, "");
  if (INDEX_PAIRS.has(upper)) return 1;
  if (JPY_PAIRS.has(upper)) return 100;
  if (upper.includes("XAU")) return 10;
  return 10000;
}

/**
 * Calculate P&L in pips.
 */
export function calculatePnlPips(
  pair: string,
  direction: "long" | "short",
  entry: number,
  exit: number
): number {
  const multiplier = getPipMultiplier(pair);
  const diff = direction === "long" ? exit - entry : entry - exit;
  return Math.round(diff * multiplier * 10) / 10;
}

/**
 * Format a pair string (normalize casing).
 */
export function formatPair(pair: string): string {
  const trimmed = pair.trim().toUpperCase();
  // If it contains a slash, format both sides
  if (trimmed.includes("/")) {
    const [a, b] = trimmed.split("/");
    return `${a}/${b}`;
  }
  return trimmed;
}

/**
 * Format dollar amount: $1,234.56 or -$1,234.56
 */
export function formatDollar(val: number): string {
  if (val < 0) return `-$${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
