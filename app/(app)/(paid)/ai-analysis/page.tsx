"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadChart } from "@/lib/storage";
import type { Analysis } from "@/lib/types";
import { COMMON_PAIRS } from "@/lib/trade-math";
import StatCard from "@/components/StatCard";
import { format } from "date-fns";

// ============================================================
// Types
// ============================================================
interface AnalysisRow {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  analysis_text: string;
  created_at: string;
  trade_id?: string | null;
  // Extended fields for chart analysis
  pair?: string;
  direction?: string;
  entry_price?: number;
  exit_price?: number;
  trade_date?: string;
  reasoning?: string;
  focus?: string;
  ict_score?: number;
  chart_urls?: string[];
}

// ============================================================
// Main Page
// ============================================================
export default function AIAnalysisPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"analyze" | "past">("analyze");

  // Multi-trade state
  interface TradeEntry {
    id: string;
    pair: string;
    direction: "long" | "short";
    entryPrices: string[]; // supports scale-in entries
    exitPrices: string[]; // supports scale-out exits
    tradeDate: string;
    reasoning: string;
  }
  const [savedTrades, setSavedTrades] = useState<TradeEntry[]>([]);

  // Analyze tab state (current trade being edited)
  const [htfFile, setHtfFile] = useState<File | null>(null);
  const [entryFile, setEntryFile] = useState<File | null>(null);
  const [extraFile, setExtraFile] = useState<File | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const [htfPreview, setHtfPreview] = useState<string | null>(null);
  const [entryPreview, setEntryPreview] = useState<string | null>(null);
  const [extraPreview, setExtraPreview] = useState<string | null>(null);
  const [pair, setPair] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [entryPrices, setEntryPrices] = useState<string[]>([""]);
  const [exitPrices, setExitPrices] = useState<string[]>([""]);
  const [tradeDate, setTradeDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [reasoning, setReasoning] = useState("");
  const [focus, setFocus] = useState("");

  // Add current trade to the list
  function addTrade() {
    if (!pair) return;
    setSavedTrades((prev) => [
      ...prev,
      { id: crypto.randomUUID(), pair, direction, entryPrices: entryPrices.filter(p => p !== ""), exitPrices: exitPrices.filter(p => p !== ""), tradeDate, reasoning },
    ]);
    // Reset form for next trade (keep date and pair)
    setDirection("long");
    setEntryPrices([""]);
    setExitPrices([""]);

    setReasoning("");
  }

  function removeTrade(id: string) {
    setSavedTrades((prev) => prev.filter((t) => t.id !== id));
  }
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [noApiKey, setNoApiKey] = useState(false);

  // Auto-detect state
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectConfidence, setDetectConfidence] = useState<Record<string, string> | null>(null);

  // Chat follow-up state
  interface ChatMsg { role: "user" | "assistant"; text: string }
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [chartUrls, setChartUrls] = useState<string[]>([]);

  // Past analyses tab state
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [calMonth, setCalMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Modal state for viewing a past analysis
  const [modalAnalysis, setModalAnalysis] = useState<AnalysisRow | null>(null);
  const [modalChat, setModalChat] = useState<ChatMsg[]>([]);
  const [modalChatInput, setModalChatInput] = useState("");
  const [modalChatSending, setModalChatSending] = useState(false);
  const modalChatEndRef = useRef<HTMLDivElement>(null);

  // Refs for file inputs
  const htfRef = useRef<HTMLInputElement>(null);
  const entryRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);

  // Pre-fill from query params (linked from dashboard/trade history)
  const searchParams = useSearchParams();
  useEffect(() => {
    const p = searchParams.get("pair");
    const d = searchParams.get("direction");
    const ep = searchParams.get("entry_price");
    const xp = searchParams.get("exit_price");
    const td = searchParams.get("trade_date");
    const r = searchParams.get("reasoning");
    if (p) {
      // Auto-add prefilled trade to the list
      setSavedTrades([{
        id: crypto.randomUUID(),
        pair: p,
        direction: (d === "long" || d === "short") ? d : "long",
        entryPrices: ep ? [ep] : [""],
        exitPrices: xp ? [xp] : [""],
        tradeDate: td || format(new Date(), "yyyy-MM-dd"),
        reasoning: r || "",
      }]);
      setPair(p);
      if (td) setTradeDate(td);
    }
  }, [searchParams]);

  // ============================================================
  // Load analyses
  // ============================================================
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); setNoApiKey(true); return; }

      // Check for API keys
      const { data: keys } = await supabase
        .from("user_api_keys")
        .select("provider")
        .eq("user_id", user.id);

      if (!keys || keys.length === 0) {
        setNoApiKey(true);
      } else {
        setNoApiKey(false);
      }

      const { data } = await supabase
        .from("analyses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setAnalyses((data as AnalysisRow[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  // ============================================================
  // File handlers
  // ============================================================
  function handleFileSelect(
    file: File | undefined,
    setter: (f: File | null) => void,
    previewSetter: (p: string | null) => void,
  ) {
    if (!file) return;
    setter(file);
    const reader = new FileReader();
    reader.onloadend = () => previewSetter(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearFile(
    setter: (f: File | null) => void,
    previewSetter: (p: string | null) => void,
    ref: React.RefObject<HTMLInputElement | null>,
  ) {
    setter(null);
    previewSetter(null);
    if (ref.current) ref.current.value = "";
  }

  const hasCharts = !!htfFile || !!entryFile;

  // ============================================================
  // Auto-detect trade details from charts
  // ============================================================
  function parseDataUrl(dataUrl: string): { base64: string; mediaType: string } | null {
    const match = dataUrl.match(/^data:(image\/[\w+]+);base64,(.+)$/);
    if (!match) return null;
    return { mediaType: match[1], base64: match[2] };
  }

  async function handleDetect() {
    setDetecting(true);
    setDetectError(null);
    setDetectConfidence(null);

    const images: Array<{ base64: string; mediaType: string; label: string }> = [];

    // Prioritize entry chart, but include all available
    if (entryPreview) {
      const parsed = parseDataUrl(entryPreview);
      if (parsed) images.push({ ...parsed, label: "entry" });
    }
    if (htfPreview) {
      const parsed = parseDataUrl(htfPreview);
      if (parsed) images.push({ ...parsed, label: "htf" });
    }
    if (extraPreview) {
      const parsed = parseDataUrl(extraPreview);
      if (parsed) images.push({ ...parsed, label: "extra" });
    }

    if (images.length === 0) {
      setDetectError("No charts to analyze");
      setDetecting(false);
      return;
    }

    try {
      const res = await fetch("/api/detect-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });

      const data = await res.json();

      if (!res.ok || !data.detected) {
        setDetectError(data.error || "Detection failed");
        setDetecting(false);
        return;
      }

      // Auto-fill form fields — only overwrite if currently empty/default
      if (data.pair && !pair) {
        const normalized = data.pair.replace(/[\s/]/g, "").toUpperCase();
        const matched = COMMON_PAIRS.find(
          (p) => p.replace(/[\s/]/g, "").toUpperCase() === normalized
        );
        if (matched) setPair(matched);
      }
      if (data.direction) {
        setDirection(data.direction);
      }
      if (data.entryPrices?.length > 0 && entryPrices.every((p) => p === "")) {
        setEntryPrices(data.entryPrices);
      }
      if (data.exitPrices?.length > 0 && exitPrices.every((p) => p === "")) {
        setExitPrices(data.exitPrices);
      }

      setDetectConfidence(data.confidence);
    } catch {
      setDetectError("Failed to connect to detection service");
    } finally {
      setDetecting(false);
    }
  }

  // ============================================================
  // Analyze handler
  // ============================================================
  async function handleAnalyze() {
    setNoApiKey(false);
    setAnalysisResult(null);
    setUploadError(null);
    setChartUrls([]);

    // Check if user has an API key
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setNoApiKey(true); return; }

    const { data: keys } = await supabase
      .from("user_api_keys")
      .select("provider")
      .eq("user_id", user.id);

    if (!keys || keys.length === 0) {
      setNoApiKey(true);
      return;
    }

    // Upload charts to Supabase Storage
    setAnalyzing(true);
    setUploading(true);

    const filesToUpload = [htfFile, entryFile, extraFile].filter(Boolean) as File[];
    const urls: string[] = [];

    try {
      for (const file of filesToUpload) {
        const url = await uploadChart(file, user.id);
        urls.push(url);
      }
      setChartUrls(urls);
      setUploading(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadError(message);
      setUploading(false);
      setAnalyzing(false);
      return;
    }

    // Call AI analysis API
    try {
      const chartDescriptions: string[] = [];
      if (htfFile) chartDescriptions.push(`Higher Timeframe (HTF) Bias chart uploaded: ${htfFile.name}${urls[0] ? ` (URL: ${urls[0]})` : ""}`);
      if (entryFile) chartDescriptions.push(`Entry Timeframe chart uploaded: ${entryFile.name}${urls[1] ? ` (URL: ${urls[1]})` : ""}`);
      if (extraFile) chartDescriptions.push(`Additional chart uploaded: ${extraFile.name}${urls[2] ? ` (URL: ${urls[2]})` : ""}`);

      // Collect all trades — saved ones + current form if filled
      const allTrades = [...savedTrades];
      if (pair && entryPrices.some(p => p !== "")) {
        allTrades.push({ id: "current", pair, direction, entryPrices: entryPrices.filter(p => p !== ""), exitPrices: exitPrices.filter(p => p !== ""), tradeDate, reasoning });
      }

      const res = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair: allTrades[0]?.pair || pair,
          direction: allTrades[0]?.direction || direction,
          entry_price: allTrades[0]?.entryPrices?.join(", ") || entryPrices.filter(p => p).join(", "),
          exit_price: allTrades[0]?.exitPrices?.join(", ") || exitPrices.filter(p => p).join(", "),
          trade_date: allTrades[0]?.tradeDate || tradeDate,
          reasoning: allTrades.map((t, i) => `Trade ${i + 1} (${t.pair} ${t.direction}): Entries [${t.entryPrices.join(", ")}], Exits [${t.exitPrices.join(", ")}]${t.reasoning ? ` — ${t.reasoning}` : ""}`).join("\n"),
          focus,
          chart_descriptions: chartDescriptions,
          chart_urls: urls,
          trades: allTrades.map((t) => ({
            pair: t.pair, direction: t.direction,
            entry_prices: t.entryPrices, exit_prices: t.exitPrices,
            trade_date: t.tradeDate, reasoning: t.reasoning,
          })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAnalysisResult(`Error: ${data.error || "Failed to analyze trade."}`);
        setAnalyzing(false);
        return;
      }

      setAnalysisResult(data.analysis);

      // Refresh past analyses list
      const { data: updated } = await supabase
        .from("analyses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (updated) setAnalyses(updated as AnalysisRow[]);
    } catch {
      setAnalysisResult("Error: Failed to connect to the analysis service. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  // ============================================================
  // Chat follow-up handler
  // ============================================================
  async function sendChat() {
    if (!chatInput.trim() || chatSending) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatSending(true);

    try {
      // Build conversation history — include the analysis as context
      const messages = [
        { role: "user", content: "Here is my trade analysis. Use this as context for follow-up questions. Be conversational, use emojis 🔥, keep answers concise (2-4 sentences). No markdown headers or bold. Plain text only.\n\n" + analysisResult },
        { role: "assistant", content: "Got it! I've reviewed your analysis. What would you like to discuss? 🔥" },
        ...chatMessages.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: userMsg },
      ];

      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (res.ok) {
        const data = await res.json();
        const cleanReply = (data.reply || "No response.").replace(/#{1,3}\s*/g, "").replace(/\*\*/g, "").replace(/💯/g, "🔥");
        setChatMessages((prev) => [...prev, { role: "assistant", text: cleanReply }]);
      } else {
        const data = await res.json().catch(() => ({}));
        setChatMessages((prev) => [...prev, { role: "assistant", text: `Error: ${data.error || "Something went wrong"} 😕` }]);
      }
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "Couldn't connect right now. Try again 🔁" }]);
    } finally {
      setChatSending(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  // ============================================================
  // Modal chat handler (for past analyses)
  // ============================================================
  async function sendModalChat() {
    if (!modalChatInput.trim() || modalChatSending || !modalAnalysis) return;
    const userMsg = modalChatInput.trim();
    setModalChatInput("");
    setModalChat((prev) => [...prev, { role: "user", text: userMsg }]);
    setModalChatSending(true);

    try {
      const messages = [
        { role: "user", content: "Here is my trade analysis. Use this as context for follow-up questions. Be conversational, use emojis 🔥, keep answers concise (2-4 sentences). No markdown headers or bold. Plain text only.\n\n" + modalAnalysis.analysis_text },
        { role: "assistant", content: "Got it! I've reviewed your analysis. What would you like to discuss? 🔥" },
        ...modalChat.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: userMsg },
      ];

      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      if (res.ok) {
        const data = await res.json();
        const cleanReply = (data.reply || "No response.").replace(/#{1,3}\s*/g, "").replace(/\*\*/g, "").replace(/💯/g, "🔥");
        setModalChat((prev) => [...prev, { role: "assistant", text: cleanReply }]);
      } else {
        const data = await res.json().catch(() => ({}));
        setModalChat((prev) => [...prev, { role: "assistant", text: `Error: ${data.error || "Something went wrong"} 😕` }]);
      }
    } catch {
      setModalChat((prev) => [...prev, { role: "assistant", text: "Couldn't connect right now. Try again 🔁" }]);
    } finally {
      setModalChatSending(false);
      setTimeout(() => modalChatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  function openAnalysisModal(a: AnalysisRow) {
    setModalAnalysis(a);
    setModalChat([]);
    setModalChatInput("");
  }

  function closeAnalysisModal() {
    setModalAnalysis(null);
    setModalChat([]);
    setModalChatInput("");
  }

  // ============================================================
  // Past analyses: calendar data
  // ============================================================
  const analysisStats = useMemo(() => {
    const totalAnalyses = analyses.length;
    const daysAnalyzed = new Set(
      analyses.map((a) => a.created_at?.slice(0, 10)).filter(Boolean)
    ).size;
    const scored = analyses.filter((a) => a.ict_score != null && a.ict_score > 0);
    const avgScore = scored.length
      ? scored.reduce((s, a) => s + (a.ict_score || 0), 0) / scored.length
      : 0;
    return { totalAnalyses, daysAnalyzed, avgScore };
  }, [analyses]);

  const calendarData = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const totalDays = lastDay.getDate();

    // Build day map
    const dayMap = new Map<string, number>();
    for (const a of analyses) {
      const dateStr = a.created_at?.slice(0, 10);
      if (!dateStr) continue;
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
    }

    const days: Array<{ date: string; day: number; count: number; isToday: boolean } | null> = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const count = dayMap.get(dateStr) || 0;
      const today = new Date();
      const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();
      days.push({ date: dateStr, day: d, count, isToday });
    }
    return days;
  }, [calMonth, analyses]);

  const calMonthLabel = calMonth.toLocaleString("default", { month: "long", year: "numeric" });

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-3xl font-bold tracking-[3px] text-chamber-orange"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15)" }}
        >
          AI ANALYSIS
        </h1>
        <p className="text-chamber-text-muted text-sm mt-1">
          Upload your chart screenshots &mdash; AI breaks down your trade using ICT methodology.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-chamber-border">
        {([
          ["analyze", "Analyze Charts"],
          ["past", "Past Analyses"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="px-5 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: activeTab === key ? "#e8651a" : "#888",
              borderBottom: activeTab === key ? "2px solid #e8651a" : "2px solid transparent",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* ANALYZE CHARTS TAB */}
      {/* ============================================================ */}
      {activeTab === "analyze" && (
        <div className="space-y-8">
          {/* Chart Screenshots */}
          <section>
            <h2
              className="text-lg font-bold tracking-wider text-chamber-orange mb-1"
              style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
            >
              CHART SCREENSHOTS
            </h2>
            <p className="text-chamber-text-muted text-xs mb-4">
              Upload your higher timeframe bias and entry timeframe charts for AI analysis.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* HTF Bias */}
              <div className="bg-chamber-surface border border-chamber-border rounded-lg p-4">
                <label className="block text-sm font-semibold text-white mb-2">
                  HTF Bias <span className="text-chamber-text-muted font-normal">(Daily / 4H / 1H)</span>
                </label>
                {htfPreview ? (
                  <div className="relative">
                    <img
                      src={htfPreview}
                      alt="HTF chart"
                      className="w-full rounded-lg border border-chamber-border max-h-[240px] object-contain bg-black"
                    />
                    <button
                      onClick={() => clearFile(setHtfFile, setHtfPreview, htfRef)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-chamber-border text-chamber-text-muted hover:text-red-400 text-sm flex items-center justify-center transition-colors"
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => htfRef.current?.click()}
                    className="w-full h-[160px] border-2 border-dashed border-chamber-border rounded-lg flex flex-col items-center justify-center gap-2 text-chamber-text-muted hover:border-chamber-orange/40 hover:text-chamber-orange transition-colors cursor-pointer"
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-sm">Click to upload HTF chart</span>
                    <span className="text-xs text-chamber-text-dim">PNG, JPG, WEBP</span>
                  </button>
                )}
                <input
                  ref={htfRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0], setHtfFile, setHtfPreview)}
                />
              </div>

              {/* Entry TF */}
              <div className="bg-chamber-surface border border-chamber-border rounded-lg p-4">
                <label className="block text-sm font-semibold text-white mb-2">
                  Entry TF <span className="text-chamber-text-muted font-normal">(15m / 5m / 1m)</span>
                </label>
                {entryPreview ? (
                  <div className="relative">
                    <img
                      src={entryPreview}
                      alt="Entry chart"
                      className="w-full rounded-lg border border-chamber-border max-h-[240px] object-contain bg-black"
                    />
                    <button
                      onClick={() => clearFile(setEntryFile, setEntryPreview, entryRef)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-chamber-border text-chamber-text-muted hover:text-red-400 text-sm flex items-center justify-center transition-colors"
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => entryRef.current?.click()}
                    className="w-full h-[160px] border-2 border-dashed border-chamber-border rounded-lg flex flex-col items-center justify-center gap-2 text-chamber-text-muted hover:border-chamber-orange/40 hover:text-chamber-orange transition-colors cursor-pointer"
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-sm">Click to upload Entry chart</span>
                    <span className="text-xs text-chamber-text-dim">PNG, JPG, WEBP</span>
                  </button>
                )}
                <input
                  ref={entryRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0], setEntryFile, setEntryPreview)}
                />
              </div>
            </div>

            {/* Extra chart — expandable */}
            <div className="mt-3">
              <button
                onClick={() => setShowExtra(!showExtra)}
                className="text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors flex items-center gap-1.5"
              >
                <span className="text-xs">{showExtra ? "v" : ">"}</span>
                Extra chart (optional)
              </button>
              {showExtra && (
                <div className="mt-3 bg-chamber-surface border border-chamber-border rounded-lg p-4">
                  {extraPreview ? (
                    <div className="relative">
                      <img
                        src={extraPreview}
                        alt="Extra chart"
                        className="w-full rounded-lg border border-chamber-border max-h-[200px] object-contain bg-black"
                      />
                      <button
                        onClick={() => clearFile(setExtraFile, setExtraPreview, extraRef)}
                        className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-chamber-border text-chamber-text-muted hover:text-red-400 text-sm flex items-center justify-center transition-colors"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => extraRef.current?.click()}
                      className="w-full h-[120px] border-2 border-dashed border-chamber-border rounded-lg flex flex-col items-center justify-center gap-2 text-chamber-text-muted hover:border-chamber-orange/40 hover:text-chamber-orange transition-colors cursor-pointer"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span className="text-sm">Click to upload extra chart</span>
                    </button>
                  )}
                  <input
                    ref={extraRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files?.[0], setExtraFile, setExtraPreview)}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Auto-detect button */}
          {hasCharts && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDetect}
                disabled={detecting || noApiKey}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold tracking-wider border border-chamber-orange/40 bg-chamber-orange/10 text-chamber-orange hover:bg-chamber-orange/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {detecting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-chamber-orange border-t-transparent rounded-full animate-spin" />
                    Detecting...
                  </>
                ) : (
                  "Detect Trade Details from Charts"
                )}
              </button>
              {detectError && (
                <span className="text-red-400 text-xs">{detectError}</span>
              )}
              {detectConfidence && !detectError && (
                <span className="text-chamber-text-muted text-xs">AI detected values — verify and correct if needed</span>
              )}
            </div>
          )}

          {/* Trade Details */}
          <section>
            <h2
              className="text-lg font-bold tracking-wider text-chamber-orange mb-1"
              style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
            >
              TRADE DETAILS
            </h2>
            <p className="text-chamber-text-muted text-xs mb-4">
              Provide context about your trade for more accurate analysis.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Date */}
              <div>
                <label className="block text-xs text-chamber-text-muted mb-1.5">Date</label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(e) => setTradeDate(e.target.value)}
                  className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors"
                />
              </div>

              {/* Pair */}
              <div>
                <label className="block text-xs text-chamber-text-muted mb-1.5">Pair</label>
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value)}
                  className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors"
                >
                  <option value="">Select...</option>
                  {COMMON_PAIRS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Direction */}
              <div>
                <label className="block text-xs text-chamber-text-muted mb-1.5">Direction</label>
                <div className="flex gap-1.5">
                  {(["long", "short"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDirection(d)}
                      className={`flex-1 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all border ${
                        direction === d
                          ? d === "long"
                            ? "bg-green-500/15 border-green-500/40 text-green-400"
                            : "bg-red-500/15 border-red-500/40 text-red-400"
                          : "bg-chamber-surface border-chamber-border text-chamber-text-muted hover:border-chamber-orange/30"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entry Price(s) — scale-in support */}
              <div>
                <label className="block text-xs text-chamber-text-muted mb-1.5">
                  Entry Price{entryPrices.length > 1 ? "s" : ""}
                </label>
                {entryPrices.map((ep, i) => (
                  <div key={i} className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] text-chamber-text-dim w-3 shrink-0">{i + 1}.</span>
                    <input
                      type="number"
                      step="any"
                      value={ep}
                      onChange={(e) => {
                        const updated = [...entryPrices];
                        updated[i] = e.target.value;
                        setEntryPrices(updated);
                      }}
                      placeholder="0.00000"
                      className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
                    />
                    {entryPrices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEntryPrices(entryPrices.filter((_, j) => j !== i))}
                        className="text-chamber-text-dim hover:text-red-400 text-xs shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEntryPrices([...entryPrices, ""])}
                  className="text-[10px] text-chamber-orange/70 hover:text-chamber-orange mt-0.5 transition-colors"
                >
                  + Scale In
                </button>
              </div>

              {/* Exit Price(s) — scale-out support */}
              <div>
                <label className="block text-xs text-chamber-text-muted mb-1.5">
                  Exit Price{exitPrices.length > 1 ? "s" : ""}
                </label>
                {exitPrices.map((xp, i) => (
                  <div key={i} className="flex items-center gap-1 mb-1">
                    <span className="text-[10px] text-chamber-text-dim w-3 shrink-0">{i + 1}.</span>
                    <input
                      type="number"
                      step="any"
                      value={xp}
                      onChange={(e) => {
                        const updated = [...exitPrices];
                        updated[i] = e.target.value;
                        setExitPrices(updated);
                      }}
                      placeholder="0.00000"
                      className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
                    />
                    {exitPrices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setExitPrices(exitPrices.filter((_, j) => j !== i))}
                        className="text-chamber-text-dim hover:text-red-400 text-xs shrink-0"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setExitPrices([...exitPrices, ""])}
                  className="text-[10px] text-chamber-orange/70 hover:text-chamber-orange mt-0.5 transition-colors"
                >
                  + Scale Out
                </button>
              </div>
            </div>
          </section>

          {/* Add Trade Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={addTrade}
              disabled={!pair}
              className="px-4 py-2 rounded-lg text-xs font-semibold tracking-wider border border-chamber-orange/40 text-chamber-orange hover:bg-chamber-orange/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              + Add Trade
            </button>
            {savedTrades.length > 0 && (
              <span className="text-chamber-text-muted text-xs">{savedTrades.length} trade{savedTrades.length !== 1 ? "s" : ""} added</span>
            )}
          </div>

          {/* Saved Trades List */}
          {savedTrades.length > 0 && (
            <div className="space-y-1.5">
              {savedTrades.map((t, i) => {
                const avgEntry = t.entryPrices.length > 0
                  ? t.entryPrices.reduce((s, p) => s + parseFloat(p || "0"), 0) / t.entryPrices.length
                  : 0;
                const avgExit = t.exitPrices.length > 0
                  ? t.exitPrices.reduce((s, p) => s + parseFloat(p || "0"), 0) / t.exitPrices.length
                  : 0;
                const pnl = avgExit && avgEntry
                  ? t.direction === "long"
                    ? avgExit - avgEntry
                    : avgEntry - avgExit
                  : 0;
                return (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-[#141414] border border-chamber-border px-3 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-chamber-text-dim text-xs font-mono">#{i + 1}</span>
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${t.direction === "long" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {t.direction.toUpperCase()}
                      </span>
                      <span className="text-white font-medium">{t.pair}</span>
                      <span className="text-chamber-text-muted text-xs">
                        @ {t.entryPrices.length > 1
                          ? t.entryPrices.join(" / ")
                          : t.entryPrices[0]}
                        {t.entryPrices.length > 1 && (
                          <span className="text-chamber-orange/60 ml-1">({t.entryPrices.length} entries)</span>
                        )}
                      </span>
                      <span className="text-chamber-text-dim text-xs">
                        → {t.exitPrices.length > 1
                          ? t.exitPrices.join(" / ")
                          : t.exitPrices[0]}
                        {t.exitPrices.length > 1 && (
                          <span className="text-chamber-orange/60 ml-1">({t.exitPrices.length} exits)</span>
                        )}
                      </span>
                      {pnl !== 0 && (
                        <span className={`text-xs font-bold ${pnl > 0 ? "text-green-400" : "text-red-400"}`}>
                          {pnl > 0 ? "W" : "L"}
                        </span>
                      )}
                    </div>
                    <button onClick={() => removeTrade(t.id)} className="text-chamber-text-dim hover:text-red-400 text-xs transition-colors">✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reasoning */}
          <section>
            <label className="block text-sm font-semibold text-white mb-2">
              What was your reasoning?
            </label>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              rows={4}
              placeholder="Describe the ICT concepts you identified: OB, FVG, liquidity sweep, MSS, kill zone timing, displacement..."
              className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim resize-none"
            />
          </section>

          {/* Focus */}
          <section>
            <label className="block text-sm font-semibold text-white mb-2">
              Want feedback on something specific?
            </label>
            <input
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. Was my OB valid? Did I enter too early? Should I have targeted the FVG above?"
              className="w-full bg-chamber-surface border border-chamber-border rounded-lg px-3 py-2.5 text-white text-sm focus:border-chamber-orange focus:outline-none transition-colors placeholder:text-chamber-text-dim"
            />
          </section>

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={!hasCharts || analyzing}
            className="w-full py-3.5 rounded-lg font-bold text-sm tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: hasCharts ? "#e8651a" : "#333",
              color: hasCharts ? "#000" : "#666",
            }}
          >
            {analyzing ? "Analyzing..." : savedTrades.length > 1 ? `Analyze ${savedTrades.length} Trades` : "Analyze Trade"}
          </button>

          {!hasCharts && (
            <p className="text-center text-chamber-text-dim text-xs -mt-3">
              Upload at least one chart screenshot to enable analysis.
            </p>
          )}

          {/* Upload Progress */}
          {uploading && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-chamber-surface border border-chamber-border -mt-2">
              <div className="w-4 h-4 border-2 border-chamber-orange border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-chamber-text-muted">Uploading charts to storage...</span>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 -mt-2">
              <p className="text-sm text-red-400">{uploadError}</p>
            </div>
          )}

          {/* Upload Success (shown with chart URLs ready) */}
          {chartUrls.length > 0 && !uploading && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/30 -mt-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-sm text-green-400">
                {chartUrls.length} chart{chartUrls.length > 1 ? "s" : ""} uploaded successfully
              </span>
            </div>
          )}

          {/* No API Key Message */}
          {noApiKey && (
            <div
              className="rounded-lg p-6 mt-2"
              style={{
                background: "#111",
                borderLeft: "3px solid #e8651a",
              }}
            >
              <p className="text-[#e8651a] font-semibold text-sm mb-3">You need a Claude API key to use AI Analysis.</p>
              <p className="text-[#d0d0d0] text-sm leading-relaxed mb-2">How to get started:</p>
              <ol className="text-[#a0a0a0] text-sm leading-relaxed list-decimal list-inside space-y-1">
                <li>Go to <span className="text-[#d0d0d0]">Settings</span> in the sidebar</li>
                <li>Get a free API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-[#e8651a] hover:text-[#ff7e33] underline">console.anthropic.com</a></li>
                <li>Paste it in Settings and hit Save</li>
                <li>Come back here to analyze your trades!</li>
              </ol>
            </div>
          )}

          {/* Analysis Result */}
          {analysisResult && (() => {
            // Strip any markdown that sneaks through
            const clean = analysisResult.replace(/#{1,3}\s*/g, "").replace(/\*\*/g, "").replace(/__/g, "").replace(/💯/g, "🔥");
            // Extract rating
            const ratingMatch = clean.match(/ICT\s+Rating:\s*([\d.]+)\s*\/\s*10/i);
            const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
            const bodyText = rating !== null ? clean.replace(/ICT\s+Rating:\s*[\d.]+\s*\/\s*10/i, "").trim() : clean;

            return (
              <div
                className="rounded-lg mt-2"
                style={{
                  background: "#111",
                  borderLeft: "3px solid #e8651a",
                  padding: "24px",
                }}
              >
                <div className="flex items-center justify-between mb-3 pb-2" style={{ borderBottom: "1px solid rgba(232,101,26,0.3)" }}>
                  <h3 className="text-lg font-bold" style={{ color: "#e8651a" }}>
                    ICT Analysis
                  </h3>
                  {rating !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-chamber-text-muted">ICT Rating</span>
                      <span
                        className="text-2xl font-black"
                        style={{
                          color: rating >= 7 ? "#4ade80" : rating >= 5 ? "#e8651a" : "#ef4444",
                          textShadow: `0 0 12px ${rating >= 7 ? "rgba(74,222,128,0.4)" : rating >= 5 ? "rgba(232,101,26,0.4)" : "rgba(239,68,68,0.4)"}`,
                        }}
                      >
                        {rating}/10
                      </span>
                    </div>
                  )}
                </div>
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap"
                  style={{ color: "#d0d0d0" }}
                >
                  {bodyText}
                </div>

              </div>
            );
          })()}

          {/* Chat follow-up — only shows after analysis */}
          {analysisResult && <div
            className="rounded-lg"
            style={{
              background: "#111",
              border: "1px solid rgba(232,101,26,0.2)",
              padding: "16px",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold" style={{ color: "#e8651a" }}>💬 Continue the conversation</span>
              <span className="text-xs text-chamber-text-dim">— ask follow-up questions about your trade</span>
            </div>

            {chatMessages.length > 0 && (
              <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto pr-1">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className="rounded-xl px-4 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap"
                      style={{
                        background: msg.role === "user" ? "rgba(232,101,26,0.15)" : "rgba(255,255,255,0.05)",
                        border: msg.role === "user" ? "1px solid rgba(232,101,26,0.3)" : "1px solid rgba(255,255,255,0.08)",
                        color: msg.role === "user" ? "#f0f0f0" : "#d0d0d0",
                      }}
                    >
                      {msg.role === "assistant" && <span className="text-xs text-chamber-orange mr-1">🔥</span>}
                      {msg.text}
                    </div>
                  </div>
                ))}
                {chatSending && (
                  <div className="flex justify-start">
                    <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span className="text-chamber-text-muted animate-pulse">thinking... 🧠</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                placeholder="Was my OB valid? Should I have waited for displacement? 💬"
                className="flex-1 bg-[#1a1a1a] border border-chamber-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-chamber-text-dim focus:border-chamber-orange focus:outline-none transition-colors"
              />
              <button
                onClick={sendChat}
                disabled={chatSending || !chatInput.trim()}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: chatInput.trim() ? "rgba(232,101,26,0.2)" : "rgba(255,255,255,0.05)",
                  border: chatInput.trim() ? "1px solid rgba(232,101,26,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  color: chatInput.trim() ? "#e8651a" : "#555",
                }}
              >
                🚀
              </button>
            </div>
          </div>}
        </div>
      )}

      {/* ============================================================ */}
      {/* PAST ANALYSES TAB */}
      {/* ============================================================ */}
      {activeTab === "past" && (
        <div className="space-y-6">
          <h2
            className="text-lg font-bold tracking-wider text-chamber-orange"
            style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
          >
            ANALYSIS CALENDAR
          </h2>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Total Analyses"
              value={String(analysisStats.totalAnalyses)}
              color="#e8651a"
            />
            <StatCard
              label="Days Analyzed"
              value={String(analysisStats.daysAnalyzed)}
              color="#e8651a"
            />
            <StatCard
              label="Avg ICT Score"
              value={analysisStats.avgScore > 0 ? analysisStats.avgScore.toFixed(1) : "--"}
              color={
                analysisStats.avgScore >= 7
                  ? "#22c55e"
                  : analysisStats.avgScore >= 4
                  ? "#e8651a"
                  : "#888"
              }
            />
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))}
              className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors"
            >
              &lt; Prev
            </button>
            <span className="text-lg font-semibold text-white">{calMonthLabel}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setCalMonth(new Date())}
                className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))}
                className="px-4 py-2 rounded-lg bg-chamber-surface border border-chamber-border text-sm text-chamber-text-muted hover:text-chamber-orange transition-colors"
              >
                Next &gt;
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 text-center text-xs text-chamber-text-muted">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
              <div key={d} className="py-1.5 font-semibold tracking-wider">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarData.map((cell, i) => {
              if (!cell) return <div key={`pad-${i}`} className="aspect-square" />;

              const hasAnalysis = cell.count > 0;
              const bg = hasAnalysis ? "rgba(232,101,26,0.12)" : "#0e0e0e";
              const border = cell.isToday
                ? "2px solid #e8651a"
                : hasAnalysis
                ? "1px solid rgba(232,101,26,0.25)"
                : "1px solid #1e1a17";

              const isSelected = selectedDate === cell.date;

              return (
                <div
                  key={cell.date}
                  onClick={() => hasAnalysis ? setSelectedDate(isSelected ? null : cell.date) : undefined}
                  className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs relative ${hasAnalysis ? "cursor-pointer hover:opacity-80" : ""}`}
                  style={{
                    background: isSelected ? "rgba(232,101,26,0.25)" : bg,
                    border: isSelected ? "2px solid #e8651a" : border,
                  }}
                >
                  <span className={cell.isToday || isSelected ? "text-chamber-orange font-bold" : "text-chamber-text-muted"}>
                    {cell.day}
                  </span>
                  {hasAnalysis && (
                    <span className="font-bold text-[0.65rem] text-chamber-orange">
                      {cell.count} {cell.count === 1 ? "analysis" : "analyses"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-6 mt-1 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "rgba(232,101,26,0.3)", border: "1px solid #e8651a" }} />
              <span className="text-chamber-text-muted">Has Analyses</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ border: "2px solid #e8651a" }} />
              <span className="text-chamber-text-muted">Today</span>
            </span>
          </div>

          {/* Analyses List — filtered by selected date or recent */}
          {(() => {
            const displayAnalyses = selectedDate
              ? analyses.filter((a) => a.created_at?.slice(0, 10) === selectedDate)
              : analyses.slice(0, 10);
            const sectionTitle = selectedDate
              ? `ANALYSES FOR ${format(new Date(selectedDate + "T12:00:00"), "MMMM d, yyyy").toUpperCase()}`
              : "RECENT ANALYSES";

            if (displayAnalyses.length === 0 && !loading) {
              return (
                <div className="bg-chamber-surface border border-chamber-border rounded-lg p-10 text-center text-chamber-text-muted text-sm">
                  {selectedDate
                    ? "No analyses for this date."
                    : "No analyses yet. Upload chart screenshots in the Analyze Charts tab to get started."}
                </div>
              );
            }

            if (displayAnalyses.length === 0) return null;

            return (
              <section className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3
                    className="text-base font-bold tracking-wider text-chamber-orange"
                    style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
                  >
                    {sectionTitle}
                  </h3>
                  {selectedDate && (
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="text-xs text-chamber-text-muted hover:text-chamber-orange transition-colors"
                    >
                      Show all recent
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {displayAnalyses.map((a) => {
                    const ratingMatch = a.analysis_text?.match(/ICT\s+Rating:\s*([\d.]+)\s*\/\s*10/i);
                    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : a.ict_score;
                    const cleanText = a.analysis_text
                      ?.replace(/#{1,3}\s*/g, "")
                      .replace(/\*\*/g, "")
                      .replace(/__/g, "") || "";

                    return (
                      <div
                        key={a.id}
                        className="rounded-lg cursor-pointer hover:bg-[#161616] transition-colors"
                        style={{
                          background: "#111",
                          borderLeft: "3px solid #e8651a",
                          padding: "16px 20px",
                        }}
                        onClick={() => openAnalysisModal(a)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            {rating != null && (
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded"
                                style={{
                                  background: rating >= 7 ? "rgba(34,197,94,0.15)" : rating >= 4 ? "rgba(232,101,26,0.15)" : "rgba(239,68,68,0.15)",
                                  color: rating >= 7 ? "#22c55e" : rating >= 4 ? "#e8651a" : "#ef4444",
                                }}
                              >
                                {rating}/10
                              </span>
                            )}
                            {a.pair && <span className="font-bold text-white text-sm">{a.pair}</span>}
                            {a.direction && (
                              <span
                                className="text-xs font-semibold uppercase px-2 py-0.5 rounded"
                                style={{
                                  background: a.direction === "long" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                  color: a.direction === "long" ? "#22c55e" : "#ef4444",
                                }}
                              >
                                {a.direction}
                              </span>
                            )}
                            {a.entry_price && <span className="text-xs text-chamber-text-muted">@ {a.entry_price}</span>}
                          </div>
                          <span className="text-xs text-chamber-text-muted">
                            {a.created_at ? format(new Date(a.created_at), "MMM d, yyyy") : ""}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "#d0d0d0" }}>
                          {cleanText}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="text-chamber-text-muted text-sm">Loading analyses...</div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-[#333] text-[0.65rem] tracking-wider">
          BASED ON ICT CONCEPTS &middot; TRAINED ON 675+ ICT YOUTUBE TRANSCRIPTS
        </p>
        <p className="text-[#292929] text-[0.58rem] mt-1">THIS IS NOT FINANCIAL ADVICE</p>
      </div>

      {/* ============================================================ */}
      {/* ANALYSIS DETAIL MODAL */}
      {/* ============================================================ */}
      {modalAnalysis && (() => {
        const ratingMatch = modalAnalysis.analysis_text?.match(/ICT\s+Rating:\s*([\d.]+)\s*\/\s*10/i);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : modalAnalysis.ict_score;
        const cleanText = modalAnalysis.analysis_text
          ?.replace(/#{1,3}\s*/g, "")
          .replace(/\*\*/g, "")
          .replace(/__/g, "") || "";

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
            onClick={(e) => { if (e.target === e.currentTarget) closeAnalysisModal(); }}
            onKeyDown={(e) => { if (e.key === "Escape") closeAnalysisModal(); }}
            tabIndex={-1}
            ref={(el) => el?.focus()}
          >
            <div
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl"
              style={{
                background: "#0e0e0e",
                border: "1px solid rgba(232,101,26,0.3)",
                boxShadow: "0 25px 60px rgba(0,0,0,0.8)",
              }}
            >
              {/* Modal Header */}
              <div
                className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
                style={{
                  background: "#0e0e0e",
                  borderBottom: "1px solid rgba(232,101,26,0.2)",
                }}
              >
                <div className="flex items-center gap-3">
                  {rating != null && (
                    <span
                      className="text-sm font-bold px-3 py-1 rounded-lg"
                      style={{
                        background: rating >= 7 ? "rgba(34,197,94,0.15)" : rating >= 4 ? "rgba(232,101,26,0.15)" : "rgba(239,68,68,0.15)",
                        color: rating >= 7 ? "#22c55e" : rating >= 4 ? "#e8651a" : "#ef4444",
                        border: `1px solid ${rating >= 7 ? "rgba(34,197,94,0.3)" : rating >= 4 ? "rgba(232,101,26,0.3)" : "rgba(239,68,68,0.3)"}`,
                      }}
                    >
                      ICT Rating: {rating}/10
                    </span>
                  )}
                  {modalAnalysis.pair && <span className="font-bold text-white text-lg">{modalAnalysis.pair}</span>}
                  {modalAnalysis.direction && (
                    <span
                      className="text-xs font-semibold uppercase px-2 py-1 rounded"
                      style={{
                        background: modalAnalysis.direction === "long" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                        color: modalAnalysis.direction === "long" ? "#22c55e" : "#ef4444",
                      }}
                    >
                      {modalAnalysis.direction}
                    </span>
                  )}
                  <span className="text-xs text-chamber-text-muted">
                    {modalAnalysis.created_at ? format(new Date(modalAnalysis.created_at), "MMM d, yyyy") : ""}
                  </span>
                </div>
                <button
                  onClick={closeAnalysisModal}
                  className="w-8 h-8 rounded-lg bg-chamber-surface border border-chamber-border text-chamber-text-muted hover:text-white hover:border-chamber-orange/30 transition-colors flex items-center justify-center text-lg"
                >
                  ✕
                </button>
              </div>

              <div className="px-6 py-5 space-y-6">
                {/* Chart Screenshots */}
                {modalAnalysis.chart_urls && modalAnalysis.chart_urls.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-chamber-text-dim tracking-wider mb-3">CHARTS</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {modalAnalysis.chart_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-chamber-border hover:border-chamber-orange/40 transition-colors">
                          <img src={url} alt={`Chart ${i + 1}`} className="w-full h-auto" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trade Details */}
                {(modalAnalysis.entry_price || modalAnalysis.exit_price || modalAnalysis.trade_date) && (
                  <div className="flex flex-wrap gap-3">
                    {modalAnalysis.trade_date && (
                      <span className="px-3 py-1.5 rounded-lg bg-chamber-surface border border-chamber-border text-xs text-chamber-text-muted">
                        Trade Date: {modalAnalysis.trade_date}
                      </span>
                    )}
                    {modalAnalysis.entry_price && (
                      <span className="px-3 py-1.5 rounded-lg bg-chamber-surface border border-chamber-border text-xs text-chamber-text-muted">
                        Entry: {modalAnalysis.entry_price}
                      </span>
                    )}
                    {modalAnalysis.exit_price && (
                      <span className="px-3 py-1.5 rounded-lg bg-chamber-surface border border-chamber-border text-xs text-chamber-text-muted">
                        Exit: {modalAnalysis.exit_price}
                      </span>
                    )}
                  </div>
                )}

                {/* Full ICT Analysis */}
                <div>
                  <h3 className="text-xs font-semibold text-chamber-text-dim tracking-wider mb-3">ICT ANALYSIS</h3>
                  <div
                    className="text-sm leading-relaxed whitespace-pre-wrap rounded-lg p-4"
                    style={{ color: "#d0d0d0", background: "#141414", border: "1px solid #1e1e1e" }}
                  >
                    {cleanText}
                  </div>
                </div>

                {/* Your Reasoning */}
                {modalAnalysis.reasoning && (
                  <div>
                    <h3 className="text-xs font-semibold text-chamber-text-dim tracking-wider mb-3">YOUR REASONING</h3>
                    <p className="text-sm text-chamber-text-muted leading-relaxed">{modalAnalysis.reasoning}</p>
                  </div>
                )}

                {/* Chat Section */}
                <div
                  className="rounded-lg p-4"
                  style={{ background: "#141414", border: "1px solid #1e1e1e" }}
                >
                  <h3 className="text-xs font-semibold text-chamber-orange tracking-wider mb-3">CONTINUE THE CONVERSATION</h3>

                  {modalChat.length > 0 && (
                    <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto">
                      {modalChat.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div
                            className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm"
                            style={{
                              background: msg.role === "user" ? "rgba(232,101,26,0.15)" : "rgba(255,255,255,0.05)",
                              border: msg.role === "user" ? "1px solid rgba(232,101,26,0.3)" : "1px solid rgba(255,255,255,0.08)",
                              color: msg.role === "user" ? "#f0f0f0" : "#d0d0d0",
                            }}
                          >
                            {msg.role === "assistant" && <span className="text-xs text-chamber-orange mr-1">🔥</span>}
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {modalChatSending && (
                        <div className="flex justify-start">
                          <div className="rounded-xl px-4 py-2.5 text-sm" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <span className="text-chamber-text-muted animate-pulse">thinking... 🧠</span>
                          </div>
                        </div>
                      )}
                      <div ref={modalChatEndRef} />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={modalChatInput}
                      onChange={(e) => setModalChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendModalChat(); } }}
                      placeholder="Ask about this trade... Was my OB valid? Should I have waited?"
                      className="flex-1 bg-[#1a1a1a] border border-chamber-border rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-chamber-text-dim focus:border-chamber-orange focus:outline-none transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); sendModalChat(); }}
                      disabled={modalChatSending || !modalChatInput.trim()}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={{
                        background: modalChatInput.trim() ? "rgba(232,101,26,0.2)" : "rgba(255,255,255,0.05)",
                        border: modalChatInput.trim() ? "1px solid rgba(232,101,26,0.4)" : "1px solid rgba(255,255,255,0.08)",
                        color: modalChatInput.trim() ? "#e8651a" : "#555",
                      }}
                    >
                      🚀
                    </button>
                  </div>
                </div>

                {/* Provider info */}
                <div className="text-center">
                  <span className="text-[0.65rem] text-chamber-text-dim">
                    {modalAnalysis.provider} / {modalAnalysis.model}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
