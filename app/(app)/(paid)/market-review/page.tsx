"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// Ticker categories & Yahoo Finance symbol mapping
// ============================================================
const CATEGORIES: Record<string, Record<string, string>> = {
  ETF: { QQQ: "QQQ", SPY: "SPY", DIA: "DIA", ARKK: "ARKK", IWM: "IWM" },
  FUTURES: { DXY: "DX=F", NQ: "NQ=F", ES: "ES=F", YM: "YM=F", MNQ: "MNQ=F", MES: "MES=F", MYM: "MYM=F", "GOLD (XAUUSD)": "GC=F", "SILVER (XAGUSD)": "SI=F", "CRUDE OIL (CL)": "CL=F", "WEST OIL (WTI)": "BZ=F" },
  FOREX: { "EUR/USD": "EURUSD=X", "GBP/USD": "GBPUSD=X", "USD/JPY": "USDJPY=X", "GBP/JPY": "GBPJPY=X", "AUD/USD": "AUDUSD=X", "USD/CAD": "USDCAD=X" },
  STOCKS: { NVIDIA: "NVDA", AMAZON: "AMZN", AMD: "AMD", MICROSOFT: "MSFT", TESLA: "TSLA" },
  CRYPTO: { BITCOIN: "BTC-USD", ETHEREUM: "ETH-USD", XRP: "XRP-USD", SOLANA: "SOL-USD" },
  CFDs: { NAS100USD: "NQ=F", SPX500USD: "ES=F", US30USD: "YM=F" },
};

const CATEGORY_COLORS: Record<string, string> = {
  ETF: "#3b82f6", FUTURES: "#a855f7", FOREX: "#22c55e", STOCKS: "#e8651a", CRYPTO: "#eab308", CFDs: "#ec4899",
};

type Timeframe = "D" | "W" | "M" | "Y";
const TF_INTERVALS: Record<Timeframe, { interval: string; range: string }> = {
  D: { interval: "1d", range: "2y" },
  W: { interval: "1wk", range: "5y" },
  M: { interval: "1mo", range: "10y" },
  Y: { interval: "1mo", range: "max" },
};

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumeData {
  time: string;
  value: number;
  color: string;
}

interface ChartMeta {
  currentPrice: number;
  prevClose: number;
  change: number;
  changePct: number;
}

// ============================================================
// TradingView Lightweight Chart Component
// ============================================================
function CandleChart({
  pairName,
  candles,
  volumes,
  meta,
  height = 420,
}: {
  pairName: string;
  candles: CandleData[];
  volumes: VolumeData[];
  meta: ChartMeta;
  height?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<unknown>(null);
  const [ohlc, setOhlc] = useState("");
  const [ema50On, setEma50On] = useState(true);
  const [ema200On, setEma200On] = useState(true);
  const ema50Ref = useRef<unknown>(null);
  const ema200Ref = useRef<unknown>(null);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    const scriptId = "lightweight-charts-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    function initChart() {
      try {
      const LWC = (window as unknown as Record<string, unknown>).LightweightCharts as Record<string, unknown> | undefined;
      if (!LWC || !chartContainerRef.current) return;

      chartContainerRef.current.innerHTML = "";

      const createChart = LWC.createChart as (container: HTMLElement, options: Record<string, unknown>) => Record<string, unknown>;
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.offsetWidth,
        height,
        layout: { background: { type: "solid", color: "#0a0a0a" }, textColor: "#555", fontSize: 10 },
        grid: { vertLines: { color: "rgba(255,255,255,0.02)" }, horzLines: { color: "rgba(255,255,255,0.02)" } },
        crosshair: {
          mode: 0,
          vertLine: { color: "rgba(232,101,26,0.4)", width: 1, style: 2, labelBackgroundColor: "#e8651a" },
          horzLine: { color: "rgba(232,101,26,0.4)", width: 1, style: 2, labelBackgroundColor: "#e8651a" },
        },
        rightPriceScale: { borderColor: "#1a1a1a", scaleMargins: { top: 0.05, bottom: 0.2 } },
        timeScale: { borderColor: "#1a1a1a", timeVisible: false, rightOffset: 3 },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = chart as any;

      const candleSeries = c.addCandlestickSeries({
        upColor: "#22c55e", downColor: "#ef4444",
        borderUpColor: "#22c55e", borderDownColor: "#ef4444",
        wickUpColor: "#22c55e", wickDownColor: "#ef4444",
      });
      candleSeries.setData(candles);

      // EMA calculation
      function calcEma(data: CandleData[], period: number) {
        const ema: Array<{ time: string; value: number }> = [];
        if (data.length < period) return ema;
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i].close;
        let prev = sum / period;
        ema.push({ time: data[period - 1].time, value: Math.round(prev * 100000) / 100000 });
        const k = 2 / (period + 1);
        for (let i = period; i < data.length; i++) {
          prev = data[i].close * k + prev * (1 - k);
          ema.push({ time: data[i].time, value: Math.round(prev * 100000) / 100000 });
        }
        return ema;
      }

      const ema50Data = calcEma(candles, 50);
      const ema200Data = calcEma(candles, 200);

      if (ema50Data.length > 0) {
        const s = c.addLineSeries({ color: "#e8651a", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(ema50Data);
        ema50Ref.current = s;
      }
      if (ema200Data.length > 0) {
        const s = c.addLineSeries({ color: "#d4d4d4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData(ema200Data);
        ema200Ref.current = s;
      }

      // Volume
      if (volumes.length > 0 && volumes.some((v) => v.value > 0)) {
        const volumeSeries = c.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol" });
        c.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volumeSeries.setData(volumes);
      }

      c.timeScale().fitContent();
      chartRef.current = c;

      // OHLC legend on crosshair move
      c.subscribeCrosshairMove((param: any) => {
        if (!param || !param.time || !param.seriesData) { setOhlc(""); return; }
        const d = param.seriesData.get(candleSeries);
        if (d) {
          const color = d.close >= d.open ? "#22c55e" : "#ef4444";
          setOhlc(
            `<span style="color:#888">O</span> <span style="color:#ccc">${d.open.toFixed(2)}</span> ` +
            `<span style="color:#888">H</span> <span style="color:#ccc">${d.high.toFixed(2)}</span> ` +
            `<span style="color:#888">L</span> <span style="color:#ccc">${d.low.toFixed(2)}</span> ` +
            `<span style="color:#888">C</span> <span style="color:${color}">${d.close.toFixed(2)}</span>`
          );
        }
      });

      // Resize
      const ro = new ResizeObserver((entries) => { c.applyOptions({ width: entries[0].contentRect.width }); });
      ro.observe(chartContainerRef.current);
      return () => ro.disconnect();
      } catch (err) { console.error("Chart init error:", err); }
    }

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js";
      script.onload = () => initChart();
      document.head.appendChild(script);
    } else {
      initChart();
    }

    return () => { try { (chartRef.current as any)?.remove?.(); } catch { /* */ } };
  }, [candles, volumes, height, pairName]);

  // Toggle EMA visibility
  useEffect(() => {
    try { (ema50Ref.current as any)?.applyOptions?.({ visible: ema50On }); } catch { /* */ }
  }, [ema50On]);

  useEffect(() => {
    try { (ema200Ref.current as any)?.applyOptions?.({ visible: ema200On }); } catch { /* */ }
  }, [ema200On]);

  return (
    <div ref={wrapRef} className="relative w-full rounded-md border border-[#1a1a1a] overflow-hidden" style={{ height, background: "#0a0a0a" }}>
      {/* Legend overlay */}
      <div className="absolute top-2.5 left-3.5 z-10 pointer-events-none" style={{ fontSize: "11px" }}>
        <div>
          <span className="text-white font-bold tracking-wide" style={{ fontSize: "13px" }}>{pairName}</span>
          {ohlc && <span className="ml-2.5" dangerouslySetInnerHTML={{ __html: ohlc }} />}
        </div>
        <div className="flex gap-3 mt-1 pointer-events-auto">
          <button onClick={() => setEma50On((v) => !v)} className="flex items-center gap-1 cursor-pointer select-none" style={{ fontSize: "11px" }}>
            <span style={{ color: "#e8651a", fontSize: "11px" }}>{ema50On ? "●" : "○"}</span>
            <span style={{ color: "#e8651a", fontWeight: 500 }}>EMA 50</span>
          </button>
          <button onClick={() => setEma200On((v) => !v)} className="flex items-center gap-1 cursor-pointer select-none" style={{ fontSize: "11px" }}>
            <span style={{ color: "#d4d4d4", fontSize: "11px" }}>{ema200On ? "●" : "○"}</span>
            <span style={{ color: "#d4d4d4", fontWeight: 500 }}>EMA 200</span>
          </button>
        </div>
      </div>
      {/* Chart container */}
      <div ref={chartContainerRef} className="w-full" style={{ height }} />
    </div>
  );
}

// ============================================================
// Single Instrument Card
// ============================================================
function InstrumentCard({
  pairName,
  yfSymbol,
  timeframe,
  onTimeframeChange,
}: {
  pairName: string;
  yfSymbol: string;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}) {
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [volumes, setVolumes] = useState<VolumeData[]>([]);
  const [meta, setMeta] = useState<ChartMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [biasResult, setBiasResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { interval, range } = TF_INTERVALS[timeframe];
    try {
      // Small stagger to avoid Yahoo rate limits
      const hash = yfSymbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      await new Promise((r) => setTimeout(r, (hash % 3) * 200));

      const res = await fetch(`/api/yahoo-candles?symbol=${encodeURIComponent(yfSymbol)}&interval=${interval}&range=${range}`);
      if (res.ok) {
        const data = await res.json();
        setCandles(data.candles || []);
        setVolumes(data.volumes || []);
        setMeta(data.meta || null);
      }
    } catch { /* */ }
    setLoading(false);
  }, [yfSymbol, timeframe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const changeColor = meta ? (meta.change >= 0 ? "#22c55e" : "#ef4444") : "#888";
  const sign = meta && meta.change >= 0 ? "+" : "";

  return (
    <div className="mb-8">
      {/* Price header bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-white text-lg font-bold">{pairName}</span>
          {meta && (
            <>
              <span className="text-white text-base font-medium">
                {meta.currentPrice < 10 ? meta.currentPrice.toFixed(4) : meta.currentPrice < 100 ? meta.currentPrice.toFixed(3) : meta.currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-sm" style={{ color: changeColor }}>
                {sign}{meta.change < 10 ? meta.change.toFixed(4) : meta.change.toFixed(2)} ({sign}{meta.changePct.toFixed(2)}%)
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[0.6rem] text-chamber-text-dim mr-2">
            <span className="inline-block w-1.5 h-[1px] bg-chamber-orange mr-1 align-middle" />EMA 50
            <span className="inline-block w-1.5 h-[1px] bg-[#d4d4d4] ml-3 mr-1 align-middle" />EMA 200
          </span>
          {(["D", "W", "M", "Y"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className="px-2 py-0.5 text-xs font-bold transition-colors"
              style={{ color: timeframe === tf ? "#e8651a" : "#444" }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="flex items-center justify-center rounded-md border border-[#1a1a1a]" style={{ height: 420, background: "#0a0a0a" }}>
          <span className="text-chamber-text-dim text-sm">Loading {pairName}...</span>
        </div>
      ) : candles.length > 0 && meta ? (
        <CandleChart pairName={pairName} candles={candles} volumes={volumes} meta={meta} />
      ) : (
        <div className="flex items-center justify-center rounded-md border border-dashed border-[#1e1a17]" style={{ height: 420 }}>
          <div className="text-center">
            <span className="text-chamber-text-muted font-semibold">{pairName}</span>
            <br />
            <span className="text-chamber-text-dim text-sm">Failed to load data</span>
          </div>
        </div>
      )}

      {/* Analyze Bias button */}
      <button
        onClick={async () => {
          if (biasResult) { setBiasResult(null); return; }
          setBiasResult("Analyzing " + pairName + "...");
          try {
            // Format candle data for the AI
            const last20 = candles.slice(-20).reverse();
            const dailyData = last20.map((c: CandleData) =>
              `${c.time} | O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`
            ).join("\n");
            const currentPrice = candles.length ? candles[candles.length - 1].close.toFixed(2) : "N/A";
            const prevClose = candles.length > 1 ? candles[candles.length - 2].close : 0;
            const change = candles.length ? candles[candles.length - 1].close - prevClose : 0;
            const changePct = prevClose ? ((change / prevClose) * 100).toFixed(2) : "0";

            const biasPrompt = `Analyze ${pairName} using SMC methodology. Here is the recent price data:

**Last 20 Daily Candles (most recent first):**
${dailyData}

**Current Price:** ${currentPrice}
**Daily Change:** ${change > 0 ? "+" : ""}${change.toFixed(2)} (${changePct}%)

Give your SMC bias analysis in this EXACT format:

## ${pairName} — SMC Bias Analysis

**DAILY BIAS:** 🟢 BULLISH / 🔴 BEARISH (X% confidence)
One sentence why — reference specific SMC concept.

**WEEKLY BIAS:** 🟢 BULLISH / 🔴 BEARISH (X% confidence)
One sentence why — reference specific SMC concept.

**MONTHLY BIAS:** 🟢 BULLISH / 🔴 BEARISH (X% confidence)
One sentence why — reference specific SMC concept.

**YEARLY BIAS:** 🟢 BULLISH / 🔴 BEARISH (X% confidence)
One sentence why — reference specific SMC concept.

**KEY LEVELS TO WATCH:**
- Sell-side liquidity: $X.XX (description)
- Buy-side liquidity: $X.XX (description)
- Key Order Block: $X.XX–$X.XX (description)
- FVG to fill: $X.XX–$X.XX (description)

**THE PLAY:** Describe the optimal SMC setup — entry model, kill zone, and confirmation needed.

Be concise and decisive. Use SMC terminology only.`;

            const res = await fetch("/api/ai-chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: [{ role: "user", content: biasPrompt }],
              }),
            });
            const data = await res.json();
            if (!res.ok) setBiasResult(data.error || "Error analyzing bias. Check your API key in Settings.");
            else setBiasResult(data.reply);
          } catch (err) {
            setBiasResult(`Error: ${err instanceof Error ? err.message : "Network error. Please try again."}`);
          }
        }}
        className="w-full mt-2 py-2 rounded-md text-sm font-semibold tracking-wider transition-all"
        style={{
          background: "rgba(232,101,26,0.06)",
          border: "1px solid rgba(232,101,26,0.25)",
          color: "#e8651a",
        }}
      >
        Analyze Bias
      </button>

      {biasResult && (
        <div className="mt-2 rounded-lg border text-sm" style={{ background: "#0e0e0e", borderColor: "rgba(232,101,26,0.25)" }}>
          <div className="p-5 space-y-2 leading-relaxed" style={{ color: "#d0d0d0" }}>
            {biasResult === `Analyzing ${pairName}...` ? (
              <p className="animate-pulse" style={{ color: "#e8651a" }}>{biasResult}</p>
            ) : (
              biasResult.split("\n").map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-2" />;
                if (trimmed.startsWith("## ")) return <h3 key={i} className="text-base font-bold mt-1" style={{ color: "#e8651a" }}>{trimmed.replace("## ", "")}</h3>;
                if (trimmed.startsWith("**") && trimmed.includes("BIAS:")) {
                  const isBullish = trimmed.includes("BULLISH");
                  return <p key={i} className="font-semibold mt-2" style={{ color: isBullish ? "#22c55e" : "#ef4444" }}>{trimmed.replace(/\*\*/g, "")}</p>;
                }
                if (trimmed.startsWith("**KEY LEVELS") || trimmed.startsWith("**THE PLAY")) return <p key={i} className="font-semibold mt-3 text-white">{trimmed.replace(/\*\*/g, "")}</p>;
                if (trimmed.startsWith("**") && trimmed.endsWith("**")) return <p key={i} className="font-semibold text-white mt-2">{trimmed.replace(/\*\*/g, "")}</p>;
                if (trimmed.startsWith("- ")) return <p key={i} className="ml-3 flex gap-2"><span style={{ color: "#e8651a" }}>•</span><span dangerouslySetInnerHTML={{ __html: trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} /></p>;
                return <p key={i} dangerouslySetInnerHTML={{ __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} />;
              })
            )}
          </div>
          {biasResult !== `Analyzing ${pairName}...` && (
            <div className="px-5 py-3 border-t" style={{ borderColor: "#1e1a17" }}>
              <button onClick={() => setBiasResult(null)} className="text-xs cursor-pointer" style={{ color: "#555" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#555"; }}
              >Clear</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================
export default function MarketReviewPage() {
  const [selectedPairs, setSelectedPairs] = useState<Record<string, string[]>>({
    ETF: ["QQQ"],
    FUTURES: ["NQ"],
    FOREX: ["EUR/USD"],
    STOCKS: [],
    CRYPTO: [],
    CFDs: [],
  });
  const [timeframe, setTimeframe] = useState<Timeframe>("D");

  function togglePair(cat: string, pair: string) {
    setSelectedPairs((prev) => {
      const next = { ...prev };
      const arr = [...(prev[cat] || [])];
      const idx = arr.indexOf(pair);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(pair);
      next[cat] = arr;
      return next;
    });
  }

  function selectAll(cat: string) {
    setSelectedPairs((prev) => {
      const next = { ...prev };
      const allPairs = Object.keys(CATEGORIES[cat]);
      const currentlyAll = allPairs.every((p) => (prev[cat] || []).includes(p));
      next[cat] = currentlyAll ? [] : [...allPairs];
      return next;
    });
  }

  // Flatten selected pairs
  const activePairs: Array<{ name: string; symbol: string }> = [];
  for (const [cat, pairs] of Object.entries(selectedPairs)) {
    for (const pair of pairs) {
      const symbol = CATEGORIES[cat]?.[pair];
      if (symbol) activePairs.push({ name: pair, symbol });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Market Review</h1>
        <p className="text-chamber-text-dim text-sm mt-1">
          Daily candles · End-of-day data · Study the chart, not the P&L
        </p>
      </div>

      {/* Instrument Picker — matching 8501 layout */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(CATEGORIES).map(([cat, tickers]) => {
          const selected = selectedPairs[cat] || [];
          const pairs = Object.keys(tickers);
          return (
            <div key={cat}>
              <label className="text-[0.65rem] font-bold tracking-[1.5px] uppercase mb-1.5 block" style={{ color: CATEGORY_COLORS[cat] }}>
                {cat}
              </label>
              <div className="flex items-center gap-1.5">
                {/* Selected pills */}
                <div className="flex flex-wrap gap-1 flex-1 min-h-[34px] items-center">
                  {pairs.filter((p) => selected.includes(p)).map((pair) => (
                    <span
                      key={pair}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[0.7rem] font-semibold tracking-wider cursor-pointer transition-all hover:opacity-80"
                      style={{ background: "rgba(232,101,26,0.12)", border: "1px solid rgba(232,101,26,0.35)", color: "#e8651a" }}
                      onClick={() => togglePair(cat, pair)}
                    >
                      {pair}
                      <span className="text-[0.6rem] opacity-50">×</span>
                    </span>
                  ))}
                </div>
                {/* Dropdown to add more */}
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) togglePair(cat, e.target.value); }}
                  className={`focus:outline-none cursor-pointer shrink-0 text-xs text-chamber-text-muted ${
                    selected.length > 0
                      ? "bg-transparent border-none appearance-none w-5 px-0"
                      : "bg-chamber-surface border border-chamber-border rounded-lg px-2 py-1.5 w-full"
                  }`}>
                  <option value="">{selected.length > 0 ? "▾" : "Choose options"}</option>
                  {pairs.filter((p) => !selected.includes(p)).map((pair) => (
                    <option key={pair} value={pair}>{pair}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      {activePairs.length === 0 ? (
        <div className="bg-chamber-surface border border-chamber-border rounded-lg p-10 text-center text-chamber-text-muted">
          Select instruments from the categories above to see charts.
        </div>
      ) : (
        <div>
          {activePairs.map((pair) => (
            <InstrumentCard
              key={pair.name}
              pairName={pair.name}
              yfSymbol={pair.symbol}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-12 mb-4">
        <p className="text-[#292929] text-[0.55rem] tracking-[1.5px] leading-relaxed">
          DATA FROM YAHOO FINANCE · DAILY CANDLES · END-OF-DAY · EMA 50 · EMA 200<br />
          BIAS ANALYSIS POWERED BY SMC METHODOLOGY · TRAINED ON 675+ SMC YOUTUBE TRANSCRIPTS<br />
          THIS IS NOT FINANCIAL ADVICE
        </p>
      </div>
    </div>
  );
}
