"use client";

import { useEffect, useState } from "react";

const TICKER_SYMBOLS: Record<string, string> = {
  "NQ=F": "NQ",
  "ES=F": "ES",
  "YM=F": "YM",
  "GC=F": "GOLD",
  "SI=F": "SILVER",
  "BTC-USD": "BTC",
  "ETH-USD": "ETH",
  "DX=F": "DXY",
};

interface TickerItem {
  name: string;
  price: number;
  change: number;
}

export default function Ticker() {
  const [prices, setPrices] = useState<TickerItem[]>([]);

  useEffect(() => {
    async function fetchPrices() {
      try {
        const symbols = Object.keys(TICKER_SYMBOLS).join(",");
        const res = await fetch(`/api/yahoo-quote?symbols=${encodeURIComponent(symbols)}`);
        if (!res.ok) return;
        const data = await res.json();
        const items: TickerItem[] = [];
        for (const [yfSym, displayName] of Object.entries(TICKER_SYMBOLS)) {
          const q = data.quotes?.[yfSym];
          if (q && q.price) {
            items.push({
              name: displayName,
              price: q.price,
              change: q.changePct || 0,
            });
          }
        }
        if (items.length > 0) setPrices(items);
      } catch { /* silent */ }
    }

    fetchPrices();
    const interval = setInterval(fetchPrices, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  if (prices.length === 0) return null;

  function formatPrice(name: string, price: number): string {
    if (["BTC", "ETH", "GOLD", "SILVER"].includes(name)) {
      return price >= 1000 ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${price.toFixed(2)}`;
    }
    if (name === "DXY") return price.toFixed(2);
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Build ticker items — doubled for seamless loop
  const tickerItems = [...prices, ...prices];

  return (
    <>
      <style>{`
        @keyframes chamberTickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "linear-gradient(180deg, #1a1a1a, #0f0f0f)",
          borderBottom: "1px solid #2a2a2a",
          padding: "5px 0",
          overflow: "hidden",
          height: "28px",
          fontFamily: "-apple-system, BlinkMacSystemFont, SF Mono, Menlo, monospace",
          // Fade the tape at both edges so mid-symbol cuts look intentional
          WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
          maskImage: "linear-gradient(90deg, transparent 0, #000 20px, #000 calc(100% - 20px), transparent 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            width: "max-content",
            animation: "chamberTickerScroll 35s linear infinite",
            fontSize: "0.72rem",
            letterSpacing: "0.3px",
            color: "#f5f5f5",
            fontWeight: 500,
          }}
        >
          {tickerItems.map((p, i) => {
            const color = p.change > 0 ? "#22c55e" : p.change < 0 ? "#ef4444" : "#888";
            const arrow = p.change > 0 ? "▲" : p.change < 0 ? "▼" : "–";
            return (
              <span key={i} style={{ padding: "0 18px", whiteSpace: "nowrap" }}>
                <span style={{ color: "#e8651a", fontWeight: 700, letterSpacing: "1px" }}>{p.name}</span>
                &nbsp;&nbsp;
                <span style={{ color: "#f5f5f5", fontWeight: 600 }}>{formatPrice(p.name, p.price)}</span>
                &nbsp;&nbsp;
                <span style={{ color, fontWeight: 600 }}>{arrow}{Math.abs(p.change).toFixed(2)}%</span>
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
