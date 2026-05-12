"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Build a deterministic key for a trade so we can detect duplicates between
 * the CSV being imported and trades already in the database. Same date + pair
 * + direction + entry/exit price + dollar P&L is overwhelmingly likely to be
 * the same trade (FTMO/MT5 don't repeat these all on the same day).
 */
function tradeDedupKey(t: {
  trade_date: string;
  pair: string;
  direction: string;
  entry_price: number | string;
  exit_price: number | string;
  pnl_dollar: number | null;
}): string {
  const e = typeof t.entry_price === "number" ? t.entry_price : parseFloat(String(t.entry_price));
  const x = typeof t.exit_price === "number" ? t.exit_price : parseFloat(String(t.exit_price));
  const d = t.pnl_dollar ?? 0;
  return `${t.trade_date}|${t.pair}|${t.direction}|${e.toFixed(5)}|${x.toFixed(5)}|${d.toFixed(2)}`;
}

const TEMPLATE_CSV = `pair,direction,entry_price,exit_price,pnl_pips,pnl_dollar,trade_date,reasoning
EUR/USD,long,1.08500,1.08750,25.0,250.00,2025-01-15,OB entry at London open
NAS100,short,21500.0,21450.0,50.0,500.00,2025-01-16,FVG fill in premium zone`;

// Aliases map common CSV header variations to our canonical column names.
// Keys are lowercase. Each canonical name lists accepted alternatives.
const HEADER_ALIASES: Record<string, string[]> = {
  pair: ["pair", "symbol", "instrument", "ticker", "asset", "market"],
  direction: ["direction", "side", "type", "buy/sell", "long/short", "position", "trade_type"],
  entry_price: ["entry_price", "entry", "open_price", "open", "entry price", "openprice"],
  exit_price: ["exit_price", "exit", "close_price", "close", "exit price", "closeprice"],
  pnl_pips: ["pnl_pips", "pips", "pip", "points", "ticks", "pnl pips"],
  pnl_dollar: ["pnl_dollar", "pnl", "p&l", "profit", "profit_loss", "net_pnl", "pnl dollar", "profit/loss", "dollar_pnl"],
  trade_date: ["trade_date", "date", "trade date", "open_date", "close_date", "datetime", "time", "open date", "close date"],
  reasoning: ["reasoning", "notes", "comment", "comments", "reason", "description", "setup", "strategy"],
};

const CANONICAL_KEYS = Object.keys(HEADER_ALIASES);

interface ParsedTrade {
  pair: string;
  direction: "long" | "short";
  entry_price: number;
  exit_price: number;
  pnl_pips: number;
  pnl_dollar: number | null;
  trade_date: string;
  reasoning: string;
}

/**
 * Split a single CSV/TSV row into fields, respecting quoted fields that may
 * contain the delimiter (e.g. `"1,234.50"` stays as one field).
 */
function splitRow(line: string, delimiter: "," | "\t"): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Detect whether file is tab-delimited or comma-delimited from the header. */
function detectDelimiter(headerLine: string): "," | "\t" {
  const tabs = (headerLine.match(/\t/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

/** Try to normalise a date string into YYYY-MM-DD for Supabase DATE column. */
function normalizeDate(raw: string): string {
  if (!raw) return "";
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // MM/DD/YYYY or M/D/YYYY
  const slash = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // DD/MM/YYYY won't be auto-detected well; try JS Date as fallback
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw; // return as-is; Supabase will reject if invalid
}

/**
 * FTMO/MT5 export uses fixed columns and has TWO "Price" columns (open and close),
 * which the generic alias parser can't disambiguate. Detect by header shape and
 * map columns by index instead.
 *
 * Header: Ticket, Open, Type, Volume, Symbol, Price, SL, TP, Close, Price, Swap,
 *         Commissions, Profit, Pips, "Trade duration in seconds"
 */
function isFTMOFormat(headers: string[]): boolean {
  return (
    headers.length >= 14 &&
    headers[0] === "ticket" &&
    headers[1] === "open" &&
    headers[2] === "type" &&
    headers[4] === "symbol" &&
    headers[5] === "price" &&
    headers[8] === "close" &&
    headers[9] === "price"
  );
}

function parseFTMORows(
  lines: string[],
  delimiter: "," | "\t",
): { trades: ParsedTrade[]; errors: string[] } {
  const trades: ParsedTrade[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i], delimiter);
    const pair = (cols[4] || "").trim();
    if (!pair) {
      errors.push(`Row ${i + 1}: missing symbol`);
      continue;
    }
    const dirRaw = (cols[2] || "").toLowerCase().trim();
    const direction: "long" | "short" =
      dirRaw === "sell" || dirRaw === "short" || dirRaw === "s" ? "short" : "long";
    const entry_price = parseFloat(cols[5]);
    const exit_price = parseFloat(cols[9]);
    const pnl_dollar_raw = parseFloat((cols[12] || "").replace(/[$,]/g, ""));
    const pnl_pips = parseFloat(cols[13]);
    trades.push({
      pair,
      direction,
      entry_price: isNaN(entry_price) ? 0 : entry_price,
      exit_price: isNaN(exit_price) ? 0 : exit_price,
      pnl_pips: isNaN(pnl_pips) ? 0 : pnl_pips,
      pnl_dollar: isNaN(pnl_dollar_raw) ? null : pnl_dollar_raw,
      trade_date: normalizeDate(cols[1] || ""),
      reasoning: "",
    });
  }
  return { trades, errors };
}

function parseCSV(text: string): { trades: ParsedTrade[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { trades: [], errors: ["File has no data rows."] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitRow(lines[0], delimiter).map((h) => h.toLowerCase());

  if (isFTMOFormat(headers)) {
    return parseFTMORows(lines, delimiter);
  }

  // Build mapping: canonical key -> column index using aliases
  const idx: Record<string, number> = {};
  for (const key of CANONICAL_KEYS) {
    for (const alias of HEADER_ALIASES[key]) {
      const i = headers.indexOf(alias);
      if (i !== -1) {
        idx[key] = i;
        break;
      }
    }
  }

  if (idx["pair"] === undefined || idx["direction"] === undefined) {
    return {
      trades: [],
      errors: [
        'CSV must include at least a pair/symbol column and a direction/side column. Found headers: ' +
          headers.join(", "),
      ],
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const trades: ParsedTrade[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i], delimiter);
    try {
      const pair = (cols[idx["pair"]] || "").trim();
      const dirRaw = (cols[idx["direction"]] || "").toLowerCase().trim();
      const direction: "long" | "short" =
        dirRaw === "short" || dirRaw === "sell" || dirRaw === "s" ? "short" : "long";
      const entry_price = idx["entry_price"] !== undefined ? parseFloat(cols[idx["entry_price"]]) : 0;
      const exit_price = idx["exit_price"] !== undefined ? parseFloat(cols[idx["exit_price"]]) : 0;
      const pnl_pips = idx["pnl_pips"] !== undefined ? parseFloat(cols[idx["pnl_pips"]]) : 0;
      const pnl_dollar =
        idx["pnl_dollar"] !== undefined && cols[idx["pnl_dollar"]]
          ? parseFloat(cols[idx["pnl_dollar"]].replace(/[$,]/g, ""))
          : null;
      const rawDate = idx["trade_date"] !== undefined ? cols[idx["trade_date"]] : "";
      const trade_date = normalizeDate(rawDate) || today;
      const reasoning = idx["reasoning"] !== undefined ? cols[idx["reasoning"]] || "" : "";

      if (!pair) {
        errors.push(`Row ${i + 1}: missing pair/symbol`);
        continue;
      }

      trades.push({
        pair,
        direction,
        entry_price: isNaN(entry_price) ? 0 : entry_price,
        exit_price: isNaN(exit_price) ? 0 : exit_price,
        pnl_pips: isNaN(pnl_pips) ? 0 : pnl_pips,
        pnl_dollar: pnl_dollar !== null && isNaN(pnl_dollar) ? null : pnl_dollar,
        trade_date,
        reasoning,
      });
    } catch {
      errors.push(`Row ${i + 1}: failed to parse`);
    }
  }

  return { trades, errors };
}

export default function ImportTradesPage() {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tradeCount, setTradeCount] = useState<number | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsedTrades, setParsedTrades] = useState<ParsedTrade[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    count: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");
  // Dedup keys for trades already in the database — used to skip duplicates
  // automatically when the user re-uploads the same FTMO CSV daily.
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());

  // Fetch current trade count + dedup keys for existing trades
  const refreshExisting = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { count } = await supabase
      .from("trades")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    setTradeCount(count ?? 0);
    const { data: existing } = await supabase
      .from("trades")
      .select("trade_date, pair, direction, entry_price, exit_price, pnl_dollar")
      .eq("user_id", user.id);
    setExistingKeys(new Set((existing || []).map(tradeDedupKey)));
  };

  useEffect(() => {
    refreshExisting();
  }, []);

  // Compute which parsed trades are already in the database (by date + pair +
  // direction + entry/exit + dollar P&L). Also dedup within the CSV itself —
  // if the file repeats the same trade, only the first instance is "new".
  const { newTrades, duplicateCount, duplicateIndices } = useMemo(() => {
    const seenKeys = new Set(existingKeys);
    const newOnes: ParsedTrade[] = [];
    const dupeIdx = new Set<number>();
    parsedTrades.forEach((t, i) => {
      const key = tradeDedupKey(t);
      if (seenKeys.has(key)) {
        dupeIdx.add(i);
      } else {
        seenKeys.add(key);
        newOnes.push(t);
      }
    });
    return {
      newTrades: newOnes,
      duplicateCount: dupeIdx.size,
      duplicateIndices: dupeIdx,
    };
  }, [parsedTrades, existingKeys]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportResult(null);
    setError("");
    setParseErrors([]);
    setParsedTrades([]);

    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { trades, errors } = parseCSV(text);
      setParsedTrades(trades);
      setParseErrors(errors);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    setError("");
    setImportResult(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not logged in.");
      setImporting(false);
      return;
    }

    if (newTrades.length === 0) {
      setImporting(false);
      setImportResult({
        success: true,
        count: 0,
        message: `No new trades to import — all ${parsedTrades.length} from this file are already in your history.`,
      });
      return;
    }

    const rows = newTrades.map((t) => ({
      user_id: user.id,
      pair: t.pair,
      direction: t.direction,
      entry_price: t.entry_price,
      exit_price: t.exit_price,
      pnl_pips: t.pnl_pips,
      pnl_dollar: t.pnl_dollar,
      trade_date: t.trade_date,
      reasoning: t.reasoning,
    }));

    const { error: dbError } = await supabase.from("trades").insert(rows);

    setImporting(false);
    if (dbError) {
      setError(dbError.message);
    } else {
      const skippedNote =
        duplicateCount > 0
          ? ` (${duplicateCount} duplicate${duplicateCount !== 1 ? "s" : ""} skipped)`
          : "";
      setImportResult({
        success: true,
        count: rows.length,
        message: `Imported ${rows.length} new trade${rows.length !== 1 ? "s" : ""}${skippedNote}.`,
      });
      setParsedTrades([]);
      setFileName("");
      if (fileRef.current) fileRef.current.value = "";
      await refreshExisting();
    }
  };

  const handleCancel = () => {
    setParsedTrades([]);
    setParseErrors([]);
    setFileName("");
    setError("");
    setImportResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chamber_trade_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stats reflect what will actually be imported (new trades only)
  const wins = newTrades.filter((t) => t.pnl_pips > 0).length;
  const losses = newTrades.filter((t) => t.pnl_pips < 0).length;
  const totalPips = newTrades.reduce((s, t) => s + t.pnl_pips, 0);
  const totalPnl = newTrades.reduce((s, t) => s + (t.pnl_dollar ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Import Trades</h1>
        <p className="text-[#888] mt-1">
          Import trade history from MT4, MT5, Tradovate, or any CSV file.
        </p>
      </div>

      {/* Trade count */}
      {tradeCount !== null && (
        <p className="text-sm text-[#888]">
          You currently have{" "}
          <span className="text-[#e8651a] font-semibold">{tradeCount}</span>{" "}
          trade{tradeCount !== 1 ? "s" : ""} in the database.
        </p>
      )}

      {/* Success message */}
      {importResult?.success && (
        <div className="rounded-lg border border-green-800 bg-green-900/20 p-4 text-green-400 text-sm">
          {importResult.message}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* File upload */}
      {parsedTrades.length === 0 && (
        <div
          className="rounded-lg border-2 border-dashed border-[#1e1a17] bg-[#141414] p-8 text-center cursor-pointer hover:border-[#e8651a]/50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv"
            onChange={handleFile}
            className="hidden"
          />
          <div className="text-[#e8651a] text-4xl mb-3">&#8593;</div>
          <p className="text-white font-medium">
            {fileName || "Click to upload a CSV file"}
          </p>
          <p className="text-[#888] text-sm mt-1">
            Accepts .csv, .txt, .tsv files
          </p>
        </div>
      )}

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="rounded-lg border border-yellow-800 bg-yellow-900/20 p-4 text-yellow-400 text-sm space-y-1">
          <p className="font-semibold">Parse warnings:</p>
          {parseErrors.map((err, i) => (
            <p key={i}>{err}</p>
          ))}
        </div>
      )}

      {/* Preview */}
      {parsedTrades.length > 0 && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Wins", value: wins, color: "text-green-400" },
              { label: "Losses", value: losses, color: "text-red-400" },
              {
                label: "Total Pips",
                value: totalPips >= 0 ? `+${totalPips.toFixed(1)}` : totalPips.toFixed(1),
                color: totalPips >= 0 ? "text-green-400" : "text-red-400",
              },
              {
                label: "Total P&L",
                value:
                  (totalPnl >= 0 ? "+$" : "-$") +
                  Math.abs(totalPnl).toFixed(2),
                color: totalPnl >= 0 ? "text-green-400" : "text-red-400",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg bg-[#141414] border border-[#1e1a17] p-4 text-center"
              >
                <p className="text-[#888] text-xs uppercase tracking-wider">
                  {s.label}
                </p>
                <p className={`text-xl font-bold mt-1 ${s.color}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* File info */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[#888]">
              Found{" "}
              <span className="text-white font-medium">{parsedTrades.length}</span>{" "}
              trades in <span className="text-[#e8651a]">{fileName}</span> —{" "}
              <span className="text-green-400 font-medium">{newTrades.length} new</span>
              {duplicateCount > 0 && (
                <>
                  ,{" "}
                  <span className="text-[#888] font-medium">
                    {duplicateCount} already in your history
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Table — shows all parsed rows; duplicates are dimmed and labelled */}
          <div className="rounded-lg border border-[#1e1a17] overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#141414] text-[#888] text-xs uppercase tracking-wider">
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Pair</th>
                    <th className="text-left p-3">Dir</th>
                    <th className="text-right p-3">Entry</th>
                    <th className="text-right p-3">Exit</th>
                    <th className="text-right p-3">Pips</th>
                    <th className="text-right p-3">P&L $</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedTrades.map((t, i) => {
                    const isWin = t.pnl_pips > 0;
                    const isLoss = t.pnl_pips < 0;
                    const isDup = duplicateIndices.has(i);
                    return (
                      <tr
                        key={i}
                        className={`border-t border-[#1e1a17] transition-colors ${
                          isDup
                            ? "opacity-40 bg-[#0d0d0d]"
                            : "hover:bg-[#1a1714]"
                        }`}
                      >
                        <td className="p-3">
                          {isDup ? (
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[#888] bg-[#1e1a17] px-2 py-0.5 rounded">
                              Duplicate
                            </span>
                          ) : (
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                              New
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-white">{t.trade_date}</td>
                        <td className="p-3 text-white font-medium">{t.pair}</td>
                        <td className="p-3">
                          <span
                            className={`text-xs font-semibold uppercase ${
                              t.direction === "long"
                                ? "text-green-400"
                                : "text-red-400"
                            }`}
                          >
                            {t.direction}
                          </span>
                        </td>
                        <td className="p-3 text-right text-[#ccc] font-mono">
                          {t.entry_price}
                        </td>
                        <td className="p-3 text-right text-[#ccc] font-mono">
                          {t.exit_price}
                        </td>
                        <td
                          className={`p-3 text-right font-mono ${
                            isWin
                              ? "text-green-400"
                              : isLoss
                              ? "text-red-400"
                              : "text-[#ccc]"
                          }`}
                        >
                          {t.pnl_pips > 0 ? "+" : ""}
                          {t.pnl_pips.toFixed(1)}
                        </td>
                        <td
                          className={`p-3 text-right font-mono ${
                            (t.pnl_dollar ?? 0) > 0
                              ? "text-green-400"
                              : (t.pnl_dollar ?? 0) < 0
                              ? "text-red-400"
                              : "text-[#ccc]"
                          }`}
                        >
                          {t.pnl_dollar !== null
                            ? `${t.pnl_dollar >= 0 ? "+" : ""}$${t.pnl_dollar.toFixed(2)}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing || newTrades.length === 0}
              className="px-6 py-2.5 rounded-lg bg-[#e8651a] hover:bg-[#ff7e33] text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing
                ? "Importing..."
                : newTrades.length === 0
                ? "Nothing new to import"
                : `Import ${newTrades.length} New Trade${newTrades.length !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={handleCancel}
              className="px-6 py-2.5 rounded-lg border border-[#1e1a17] text-[#888] hover:text-white hover:border-[#333] text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* CSV Template */}
      <div className="rounded-lg border border-[#1e1a17] bg-[#141414] p-5 space-y-3">
        <h2 className="text-white font-semibold">CSV Template</h2>
        <p className="text-[#888] text-sm">
          Use this template to format your trades for import. Required columns:{" "}
          <span className="text-white">pair</span> and{" "}
          <span className="text-white">direction</span>. All others are
          optional.
        </p>
        <pre className="text-xs text-[#aaa] bg-[#0a0a0a] rounded-lg p-4 overflow-x-auto border border-[#1e1a17]">
          {TEMPLATE_CSV}
        </pre>
        <button
          onClick={downloadTemplate}
          className="px-4 py-2 rounded-lg border border-[#e8651a] text-[#e8651a] hover:bg-[#e8651a]/10 text-sm font-medium transition-colors"
        >
          Download Template CSV
        </button>
      </div>
    </div>
  );
}
