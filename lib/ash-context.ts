/**
 * Builds the [TRADER DATA] block Chamber Ash reads on every message.
 *
 * Ash runs on the Mac mini with NO tools, so everything it knows about a
 * member comes from here, scoped to that member: their Edge Report (the same
 * computeEdgeReport the Performance page renders, so Ash never does its own
 * math), recent journal entries, and what they've recently told Ember/Amber.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalEntry, Trade } from "./types";
import { computeEdgeReport, type EdgeStats } from "./trade-stats";

const MAX_CONTEXT_CHARS = 40_000; // the mini accepts up to 60k
const JOURNAL_ENTRIES = 7;
const MENTOR_MESSAGES = 12; // per mentor, most recent user messages
const MENTOR_MESSAGE_CHARS = 400;

const n = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !isFinite(v) ? "n/a" : v.toFixed(digits);
const usd = (v: number | null | undefined) =>
  v === null || v === undefined || !isFinite(v) ? "n/a" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
const mins = (v: number | null) => (v === null ? "n/a" : v < 60 ? `${Math.round(v)}m` : `${Math.floor(v / 60)}h ${Math.round(v % 60)}m`);

function statsBlock(label: string, s: EdgeStats, money: (v: number | null) => string): string {
  if (!s.trades) return `${label}: no trades`;
  return [
    `${label}: ${s.trades} trades over ${s.tradingDays} days (${s.firstDate} to ${s.lastDate})`,
    `  Net ${money(s.netProfit)} | win rate ${n(s.winRate, 1)}% (${s.winners}W/${s.losers}L/${s.breakeven}BE) | profit factor ${n(s.profitFactor)} | expectancy/trade ${money(s.avgTrade)}`,
    `  Avg win ${money(s.avgWin)} | avg loss ${money(s.avgLoss)} | win/loss ratio ${n(s.winLossRatio)} | largest win ${money(s.largestWin)} | largest loss ${money(s.largestLoss)}`,
    `  Sharpe ${n(s.sharpe)} | Sortino ${n(s.sortino)} (per trade) | max drawdown ${money(-s.maxDrawdown)} | current drawdown ${money(-s.currentDrawdown)} | recovery factor ${n(s.recoveryFactor)} | longest drawdown ${s.longestDrawdownDays}d`,
    `  Streaks: max ${s.maxConsecWins} wins / ${s.maxConsecLosses} losses in a row | ${n(s.avgTradesPerDay, 1)} trades/day | green-day rate ${n(s.dayWinRate, 0)}%`,
    `  Risk known on ${s.riskTrades}/${s.trades} | avg risk ${usd(s.avgRisk)} | risk swing ${s.riskSwing === null ? "n/a" : `±${n(s.riskSwing, 0)}%`} | expectancy ${s.expectancyR === null ? "n/a" : `${n(s.expectancyR)}R`} | avg winner ${s.avgWinR === null ? "n/a" : `${n(s.avgWinR)}R`}`,
    `  Hold time: winners ${mins(s.avgHoldWinMin)} | losers ${mins(s.avgHoldLossMin)}`,
  ].join("\n");
}

function edgeReportText(trades: Trade[]): string {
  if (!trades.length) return "EDGE REPORT: no trades logged yet.";
  const r = computeEdgeReport(trades);
  const money = (v: number | null) => (r.unit === "usd" ? usd(v) : v === null ? "n/a" : `${v.toFixed(1)} pips`);
  const size = (v: number | null) =>
    v === null ? "n/a" : r.sizeBasis === "lots" ? `${v.toFixed(1)} lots` : usd(v);
  return [
    `EDGE REPORT (all time, ${r.unit === "usd" ? "dollars" : "pips"}${r.excluded ? `, ${r.excluded} trades without P&L excluded` : ""})`,
    `CONFIDENCE: ${r.confidence.level.toUpperCase()} — ${r.confidence.note}`,
    statsBlock("ALL", r.all, money),
    statsBlock("LONG", r.long, money),
    statsBlock("SHORT", r.short, money),
    `DAY AFTER: after red days (${r.afterRedDay.days}) ${n(r.afterRedDay.avgTrades, 1)} trades, avg ${money(r.afterRedDay.avgPnl)}, size ${size(r.afterRedDay.avgSize)} | after green days (${r.afterGreenDay.days}) ${n(r.afterGreenDay.avgTrades, 1)} trades, avg ${money(r.afterGreenDay.avgPnl)}, size ${size(r.afterGreenDay.avgSize)}`,
    r.sizeBasis
      ? `SIZING (${r.sizeBasis === "risk" ? "$ risk" : "lots"}) on the next trade: after a loss ${size(r.afterLosingTrade.avgSize)} (${r.afterLosingTrade.trades} trades) vs after a win ${size(r.afterWinningTrade.avgSize)} (${r.afterWinningTrade.trades} trades)`
      : "SIZING: not available (no lot size or stop loss on trades)",
  ].join("\n");
}

function journalText(entries: JournalEntry[]): string {
  if (!entries.length) return "JOURNAL: no entries.";
  return [
    `JOURNAL (last ${entries.length} entries, newest first)`,
    ...entries.map((j) =>
      [
        `- ${j.journal_date}: readiness ${j.readiness_score} (${j.readiness_label}); sleep ${j.sleep}, energy ${j.energy}, focus ${j.focus}, mood ${j.mood}, stress ${j.stress}, confidence ${j.confidence}`,
        j.emotional_states?.length ? `  emotions: ${j.emotional_states.join(", ")}` : "",
        j.mistakes?.length ? `  mistakes: ${j.mistakes.join(", ")}` : "",
        j.reflection ? `  reflection: ${j.reflection.slice(0, 300)}` : "",
        j.lessons_learned ? `  lessons: ${j.lessons_learned.slice(0, 200)}` : "",
      ].filter(Boolean).join("\n")
    ),
  ].join("\n");
}

/**
 * App capability: the chat renders ```sizing-plan blocks as interactive charts
 * (lib/position-sizing.ts computes every number). Lives here, next to the
 * renderer contract, rather than in the mini's persona.
 */
const FENCE = "```";
const SIZING_PLAN_INSTRUCTIONS = `APP FEATURE — POSITION SIZING PLANS
If the trader asks for a position sizing plan / sizing chart / lot size chart, build one:
1. You need: account size, firm + rules (or "personal account"), instruments, and how much they want to risk per trade. Ask ONE short question for anything essential you don't know. If the firm is FTMO 2-Step $100k, standard rules are 10% phase-1 target, 5% phase-2 target, 5% max daily loss, 10% max loss, 4 min trading days — say they should confirm current rules. Use their Edge Report (avg risk per trade, instruments they trade) to pick sensible risk rows, and mention it.
2. Then reply with a short intro (1-3 sentences) and EXACTLY ONE fenced block like this — inputs only, valid JSON, no comments:
${FENCE}sizing-plan
{"title":"FTMO $100K Sizing Plan","firm":"FTMO 2-Step","account":100000,
 "rules":{"profitTargetPct":10,"phase2TargetPct":5,"maxDailyLossPct":5,"personalDailyCapPct":1,"maxLossPct":10,"minTradingDays":4},
 "instruments":[{"symbol":"NAS100USD","name":"Nasdaq-100","dollarPerPoint":1,"volStep":0.01,"stops":[5,10,15,20,25,30,40,50],"targets":[10,20,30,50,75,100]}],
 "riskAmounts":[50,100,250,500,750,1000],"riskPcts":[0.25,0.5,1],"lotSizes":[5,10,25,50,100],
 "notes":["Max 2 losses per day at 0.5% keeps you under the 1% personal cap"]}
${FENCE}
- dollarPerPoint = $ per 1-point move for ONE lot/contract on THEIR platform (FTMO index CFDs NAS100/US500/US30: 1; NQ 20, MNQ 2, ES 50, MES 5, YM 5, MYM 0.5; volStep 1 for futures). If unsure, use these and say to verify.
- Up to 4 instruments, up to 10 stops/targets, 8 riskAmounts, 4 riskPcts, 6 lotSizes. Omit rules you don't know.
- NEVER write lot sizes, risk dollars or profit numbers yourself — the app calculates and draws all of them from the block. Don't repeat the tables in text.`;

type ConversationRow = { bot_name: string; role: string; content: unknown; created_at: string };

function mentorText(rows: ConversationRow[]): string {
  const textOf = (c: unknown) =>
    typeof c === "string" ? c : c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "";
  const section = (bot: string, label: string) => {
    const msgs = rows
      .filter((r) => r.bot_name === bot && r.role === "user")
      .map((r) => ({ at: r.created_at.slice(0, 10), text: textOf(r.content).trim() }))
      .filter((m) => m.text)
      .slice(0, MENTOR_MESSAGES);
    if (!msgs.length) return `${label}: no recent messages.`;
    return [`${label} (what they recently said, newest first)`, ...msgs.map((m) => `- [${m.at}] ${m.text.slice(0, MENTOR_MESSAGE_CHARS)}`)].join("\n");
  };
  return [section("ember", "TO EMBER (technical)"), section("amber", "TO AMBER (mental game)")].join("\n\n");
}

/**
 * @param supabase the member's own (RLS-scoped) client — trades + journal
 * @param admin    service-role client — agent_conversations is mini-owned,
 *                 read here only for this member's own web channels
 */
export async function buildAshContext(
  supabase: SupabaseClient,
  admin: SupabaseClient | null,
  userId: string
): Promise<string> {
  const [tradesRes, journalRes, convoRes] = await Promise.all([
    supabase.from("trades").select("*").eq("user_id", userId).order("trade_date", { ascending: false }).limit(5000),
    supabase.from("journal_entries").select("*").eq("user_id", userId).order("journal_date", { ascending: false }).limit(JOURNAL_ENTRIES),
    admin
      ? admin
          .from("agent_conversations")
          .select("bot_name, role, content, created_at")
          .in("bot_name", ["ember", "amber"])
          .like("channel_id", `web-${userId}%`)
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as ConversationRow[] }),
  ]);

  const text = [
    SIZING_PLAN_INSTRUCTIONS,
    edgeReportText((tradesRes.data as Trade[]) || []),
    journalText((journalRes.data as JournalEntry[]) || []),
    mentorText((convoRes.data as ConversationRow[]) || []),
  ].join("\n\n");

  return text.length > MAX_CONTEXT_CHARS ? text.slice(0, MAX_CONTEXT_CHARS) + "\n[truncated]" : text;
}
