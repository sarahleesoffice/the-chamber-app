"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WatchlistItem } from "@/lib/types";

const SYMBOL_GROUPS: Record<string, string[]> = {
  ETFs: ["QQQ", "SPY", "DIA", "IWM"],
  Futures: ["NQ", "ES", "YM", "DXY", "GOLD", "SILVER"],
  Forex: ["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY", "AUD/USD"],
  Crypto: ["BTC", "ETH", "SOL", "XRP"],
  Stocks: ["NVDA", "AAPL", "TSLA", "AMZN", "AMD"],
};

// Map display names to Yahoo Finance symbols
const YF_SYMBOL_MAP: Record<string, string> = {
  QQQ: "QQQ", SPY: "SPY", DIA: "DIA", IWM: "IWM",
  NQ: "NQ=F", ES: "ES=F", YM: "YM=F", DXY: "DX=F", GOLD: "GC=F", SILVER: "SI=F",
  "EUR/USD": "EURUSD=X", "GBP/USD": "GBPUSD=X", "USD/JPY": "USDJPY=X", "GBP/JPY": "GBPJPY=X", "AUD/USD": "AUDUSD=X",
  BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD", XRP: "XRP-USD",
  NVDA: "NVDA", AAPL: "AAPL", TSLA: "TSLA", AMZN: "AMZN", AMD: "AMD",
};

interface QuoteData { price: number; change: number; changePct: number }


function isForex(symbol: string) {
  return symbol.includes("/");
}

function formatPrice(symbol: string, price: number | null) {
  if (price === null) return "--";
  if (isForex(symbol)) return price.toFixed(symbol.includes("JPY") ? 3 : 5);
  return price.toFixed(2);
}

function formatChange(value: number | null) {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

function formatChangePct(value: number | null) {
  if (value === null) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function changeColor(value: number | null) {
  if (value === null) return "text-chamber-text-dim";
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-chamber-text-dim";
}

export default function WatchlistPage() {
  const supabase = createClient();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("watchlist")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("created_at", { ascending: true });
    setItems((data as WatchlistItem[]) || []);
    setLoading(false);
  }

  async function addSymbol() {
    if (!selectedSymbol || adding) return;
    // Prevent duplicates
    if (items.some((i) => i.pair === selectedSymbol)) {
      setSelectedSymbol("");
      return;
    }
    setAdding(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAdding(false);
      return;
    }
    const { error } = await supabase.from("watchlist").insert({
      user_id: user.id,
      pair: selectedSymbol,
      bias: "neutral",
      timeframe: "",
      key_levels: "",
      notes: "",
      setup_type: "",
      active: true,
    });
    if (!error) {
      await loadItems();
      setSelectedSymbol("");
    }
    setAdding(false);
  }

  async function removeItem(id: string) {
    setRemovingId(id);
    const { error } = await supabase.from("watchlist").delete().eq("id", id);
    if (!error) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
    setRemovingId(null);
  }

  // Fetch live prices from Yahoo Finance
  useEffect(() => {
    if (items.length === 0) return;
    async function fetchQuotes() {
      setQuotesLoading(true);
      const yfSymbols = items.map((i) => YF_SYMBOL_MAP[i.pair] || i.pair).join(",");
      try {
        const res = await fetch(`/api/yahoo-quote?symbols=${encodeURIComponent(yfSymbols)}`);
        if (res.ok) {
          const data = await res.json();
          const mapped: Record<string, QuoteData> = {};
          for (const item of items) {
            const yfSym = YF_SYMBOL_MAP[item.pair] || item.pair;
            const q = data.quotes?.[yfSym];
            if (q) mapped[item.pair] = { price: q.price, change: q.change, changePct: q.changePct };
          }
          setQuotes(mapped);
        }
      } catch { /* silent */ }
      setQuotesLoading(false);
    }
    fetchQuotes();
    const interval = setInterval(fetchQuotes, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [items]);

  const priceData: Record<string, { last: number | null; chg: number | null; chgPct: number | null }> = {};
  items.forEach((item) => {
    const q = quotes[item.pair];
    priceData[item.pair] = q
      ? { last: q.price, chg: q.change, chgPct: q.changePct }
      : { last: null, chg: null, chgPct: null };
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold tracking-[3px] text-chamber-orange"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          WATCHLIST
        </h1>
        <p className="text-chamber-text-dim text-sm mt-1 tracking-wide">
          Track your symbols &middot; Live prices &middot; End-of-day data
        </p>
      </div>

      {/* Add Symbol */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-[0.65rem] uppercase tracking-wider text-chamber-text-dim mb-1 block">
            Add Symbol
          </label>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-chamber-orange/50 transition-colors appearance-none cursor-pointer"
          >
            <option value="">Select a symbol...</option>
            {Object.entries(SYMBOL_GROUPS).map(([group, symbols]) => (
              <optgroup key={group} label={group}>
                {symbols.map((s) => (
                  <option
                    key={s}
                    value={s}
                    disabled={items.some((i) => i.pair === s)}
                  >
                    {s}
                    {items.some((i) => i.pair === s) ? " (added)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          onClick={addSymbol}
          disabled={!selectedSymbol || adding}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-chamber-orange/15 text-chamber-orange border border-chamber-orange/30 hover:bg-chamber-orange/25 hover:border-chamber-orange/50"
        >
          {adding ? "..." : "+ Add"}
        </button>
      </div>

      {/* Live prices status */}
      {quotesLoading && items.length > 0 && (
        <div className="text-chamber-text-dim text-xs">Fetching live prices...</div>
      )}
      {Object.keys(quotes).length > 0 && (
        <div className="text-[0.65rem] text-chamber-text-dim">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-chamber-green mr-1" />
          Live prices from Yahoo Finance · Refreshes every 5 min
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-chamber-text-dim text-sm">
          Loading watchlist...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-chamber-text-dim text-sm">
            Your watchlist is empty
          </div>
          <div className="text-chamber-text-dim/50 text-xs mt-1">
            Add symbols above to start tracking
          </div>
        </div>
      ) : (
        <div className="bg-chamber-surface border border-chamber-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-chamber-border">
                <th className="text-left px-4 py-3 text-[0.6rem] uppercase tracking-widest text-chamber-text-dim font-medium">
                  Symbol
                </th>
                <th className="text-right px-4 py-3 text-[0.6rem] uppercase tracking-widest text-chamber-text-dim font-medium">
                  Last
                </th>
                <th className="text-right px-4 py-3 text-[0.6rem] uppercase tracking-widest text-chamber-text-dim font-medium">
                  Chg
                </th>
                <th className="text-right px-4 py-3 text-[0.6rem] uppercase tracking-widest text-chamber-text-dim font-medium">
                  Chg%
                </th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const pd = priceData[item.pair] || {
                  last: null,
                  chg: null,
                  chgPct: null,
                };
                return (
                  <tr
                    key={item.id}
                    className="border-b border-chamber-border/50 last:border-0 transition-colors hover:bg-[#141414]"
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white text-sm tracking-wide">
                        {item.pair}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-chamber-text-muted">
                      {formatPrice(item.pair, pd.last)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums text-sm ${changeColor(pd.chg)}`}
                    >
                      {formatChange(pd.chg)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums text-sm ${changeColor(pd.chgPct)}`}
                    >
                      {formatChangePct(pd.chgPct)}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={() => item.id && removeItem(item.id)}
                        disabled={removingId === item.id}
                        className="text-chamber-text-dim/40 hover:text-red-400 transition-colors text-sm leading-none p-1 disabled:opacity-30"
                        title="Remove from watchlist"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-[#333] text-[0.65rem] tracking-wider">
          {items.length} SYMBOL{items.length !== 1 ? "S" : ""} &middot; DATA
          FROM YAHOO FINANCE &middot; END-OF-DAY &middot; 5 MIN CACHE
        </p>
        <p className="text-[#292929] text-[0.58rem] mt-1">
          THIS IS NOT FINANCIAL ADVICE
        </p>
      </div>
    </div>
  );
}
