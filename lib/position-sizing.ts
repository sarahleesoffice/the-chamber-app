/**
 * Position sizing plans — Ash supplies the INPUTS as a ```sizing-plan JSON
 * block; every lot size and dollar figure is computed here, so the chart is
 * always arithmetically right no matter what the model writes.
 */

export interface SizingInstrument {
  symbol: string;
  name: string;
  dollarPerPoint: number; // $ per 1 point move for 1 lot/contract
  volStep: number; // smallest lot increment (0.01 CFDs, 1 futures)
  stops: number[]; // stop distances in points
  targets: number[]; // target distances in points
  note?: string;
}

export interface SizingRules {
  profitTargetPct?: number;
  phase2TargetPct?: number;
  maxDailyLossPct?: number;
  personalDailyCapPct?: number;
  maxLossPct?: number;
  minTradingDays?: number;
}

export interface SizingPlan {
  title: string;
  firm: string;
  account: number;
  rules: SizingRules;
  instruments: SizingInstrument[];
  riskAmounts: number[]; // $ per trade rows for Chart 1
  riskPcts: number[]; // % of account columns for Chart 2
  lotSizes: number[]; // columns for Chart 3
  notes: string[];
}

/** Common contract values, used when Ash leaves dollarPerPoint/volStep out. Always "verify on your platform". */
const KNOWN: Record<string, Pick<SizingInstrument, "name" | "dollarPerPoint" | "volStep" | "stops" | "targets">> = {
  NAS100: { name: "Nasdaq-100", dollarPerPoint: 1, volStep: 0.01, stops: [5, 10, 15, 20, 25, 30, 40, 50], targets: [10, 20, 30, 50, 75, 100] },
  US500: { name: "S&P 500", dollarPerPoint: 1, volStep: 0.01, stops: [2, 3, 5, 7, 10, 15, 20, 25], targets: [5, 10, 15, 20, 30, 50] },
  US30: { name: "Dow Jones 30", dollarPerPoint: 1, volStep: 0.01, stops: [10, 20, 30, 50, 75, 100, 150, 200], targets: [30, 50, 100, 150, 200, 300] },
  NQ: { name: "E-mini Nasdaq-100", dollarPerPoint: 20, volStep: 1, stops: [5, 10, 15, 20, 25, 30, 40, 50], targets: [10, 20, 30, 50, 75, 100] },
  MNQ: { name: "Micro E-mini Nasdaq-100", dollarPerPoint: 2, volStep: 1, stops: [5, 10, 15, 20, 25, 30, 40, 50], targets: [10, 20, 30, 50, 75, 100] },
  ES: { name: "E-mini S&P 500", dollarPerPoint: 50, volStep: 1, stops: [2, 3, 5, 7, 10, 15, 20, 25], targets: [5, 10, 15, 20, 30, 50] },
  MES: { name: "Micro E-mini S&P 500", dollarPerPoint: 5, volStep: 1, stops: [2, 3, 5, 7, 10, 15, 20, 25], targets: [5, 10, 15, 20, 30, 50] },
  YM: { name: "E-mini Dow", dollarPerPoint: 5, volStep: 1, stops: [10, 20, 30, 50, 75, 100, 150, 200], targets: [30, 50, 100, 150, 200, 300] },
  MYM: { name: "Micro E-mini Dow", dollarPerPoint: 0.5, volStep: 1, stops: [10, 20, 30, 50, 75, 100, 150, 200], targets: [30, 50, 100, 150, 200, 300] },
};

function knownFor(symbol: string) {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (KNOWN[s]) return KNOWN[s];
  if (/^(NAS100|US100|USTEC|NDX)/.test(s)) return KNOWN.NAS100;
  if (/^(US500|SPX500|SP500)/.test(s)) return KNOWN.US500;
  if (/^(US30|DJ30|DJI)/.test(s)) return KNOWN.US30;
  return null;
}

const num = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return isFinite(n) && n >= min && n <= max ? n : null;
};
const nums = (v: unknown, min: number, max: number, limit: number): number[] =>
  Array.isArray(v)
    ? [...new Set(v.map((x) => num(x, min, max)).filter((x): x is number => x !== null))].sort((a, b) => a - b).slice(0, limit)
    : [];
const str = (v: unknown, max: number, fallback = ""): string => (typeof v === "string" ? v.trim().slice(0, max) : fallback);

/** Parse + validate Ash's JSON. Returns null if it can't produce a usable plan. */
export function parseSizingPlan(raw: string): SizingPlan | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;

  const account = num(data.account, 100, 100_000_000);
  if (!account) return null;

  const instruments: SizingInstrument[] = (Array.isArray(data.instruments) ? data.instruments : [])
    .slice(0, 4)
    .map((x: unknown): SizingInstrument | null => {
      const i = (x || {}) as Record<string, unknown>;
      const symbol = str(i.symbol, 24);
      if (!symbol) return null;
      const known = knownFor(symbol);
      const dollarPerPoint = num(i.dollarPerPoint, 0.0001, 10_000) ?? known?.dollarPerPoint ?? null;
      if (!dollarPerPoint) return null;
      const stops = nums(i.stops, 0.1, 100_000, 10);
      const targets = nums(i.targets, 0.1, 100_000, 10);
      return {
        symbol,
        name: str(i.name, 48) || known?.name || symbol,
        dollarPerPoint,
        volStep: num(i.volStep, 0.0001, 100) ?? known?.volStep ?? 0.01,
        stops: stops.length ? stops : known?.stops ?? [5, 10, 20, 30, 50],
        targets: targets.length ? targets : known?.targets ?? [10, 20, 50, 100],
        note: str(i.note, 200) || undefined,
      };
    })
    .filter((x): x is SizingInstrument => x !== null);
  if (!instruments.length) return null;

  const r = (data.rules || {}) as Record<string, unknown>;
  const rules: SizingRules = {
    profitTargetPct: num(r.profitTargetPct, 0.1, 100) ?? undefined,
    phase2TargetPct: num(r.phase2TargetPct, 0.1, 100) ?? undefined,
    maxDailyLossPct: num(r.maxDailyLossPct, 0.1, 100) ?? undefined,
    personalDailyCapPct: num(r.personalDailyCapPct, 0.01, 100) ?? undefined,
    maxLossPct: num(r.maxLossPct, 0.1, 100) ?? undefined,
    minTradingDays: num(r.minTradingDays, 0, 365) ?? undefined,
  };

  const riskAmounts = nums(data.riskAmounts, 1, account, 8);
  const riskPcts = nums(data.riskPcts, 0.01, 10, 4);
  const lotSizes = nums(data.lotSizes, 0.01, 100_000, 6);

  return {
    title: str(data.title, 80) || "Position Sizing Plan",
    firm: str(data.firm, 60),
    account,
    rules,
    instruments,
    riskAmounts: riskAmounts.length ? riskAmounts : [0.0005, 0.001, 0.0025, 0.005, 0.01].map((p) => Math.round(account * p)),
    riskPcts: riskPcts.length ? riskPcts : [0.25, 0.5, 1],
    lotSizes: lotSizes.length ? lotSizes : [1, 5, 10, 25, 50],
    notes: (Array.isArray(data.notes) ? data.notes : []).map((n) => str(n, 240)).filter(Boolean).slice(0, 6),
  };
}

/** Lots for a $ risk at a stop distance, rounded DOWN to the volume step so risk never exceeds the cap. */
export function lotsFor(risk: number, stopPts: number, inst: SizingInstrument) {
  const raw = risk / (stopPts * inst.dollarPerPoint);
  const steps = Math.floor(raw / inst.volStep + 1e-9);
  const lots = steps * inst.volStep;
  return { lots, actualRisk: lots * stopPts * inst.dollarPerPoint };
}

export function profitFor(lots: number, targetPts: number, inst: SizingInstrument) {
  return lots * targetPts * inst.dollarPerPoint;
}

export const fmtMoney = (v: number) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function fmtLots(lots: number, inst: SizingInstrument) {
  if (inst.volStep >= 1) return String(Math.round(lots));
  const decimals = Math.min(2, Math.max(0, -Math.floor(Math.log10(inst.volStep))));
  return lots.toFixed(decimals);
}

/** Rule cards shown at the top of the plan (only the rules Ash provided). */
export function ruleCards(plan: SizingPlan) {
  const a = plan.account;
  const pct = (p: number) => fmtMoney((a * p) / 100);
  const r = plan.rules;
  const cards: { label: string; value: string; sub: string; tone: "green" | "blue" | "amber" | "red" | "violet" }[] = [];
  if (r.profitTargetPct) cards.push({ label: "Profit target (phase 1)", value: pct(r.profitTargetPct), sub: `${r.profitTargetPct}% of balance`, tone: "green" });
  if (r.phase2TargetPct) cards.push({ label: "Profit target (phase 2)", value: pct(r.phase2TargetPct), sub: `${r.phase2TargetPct}% verification`, tone: "blue" });
  if (r.personalDailyCapPct) cards.push({ label: "Daily loss cap (yours)", value: pct(r.personalDailyCapPct), sub: r.maxDailyLossPct ? `${r.personalDailyCapPct}% personal · firm's is ${pct(r.maxDailyLossPct)}` : `${r.personalDailyCapPct}% personal cap`, tone: "amber" });
  else if (r.maxDailyLossPct) cards.push({ label: "Max daily loss", value: pct(r.maxDailyLossPct), sub: `${r.maxDailyLossPct}% of balance`, tone: "amber" });
  if (r.maxLossPct) cards.push({ label: "Max overall loss", value: pct(r.maxLossPct), sub: `${r.maxLossPct}% · equity can't drop below ${fmtMoney(a - (a * r.maxLossPct) / 100)}`, tone: "red" });
  if (r.minTradingDays !== undefined) cards.push({ label: "Min trading days", value: String(r.minTradingDays), sub: "at least 1 trade per day", tone: "violet" });
  return cards;
}

/** Lot-size color bands, relative to the plan's biggest sizes. */
export function lotTone(lots: number): string {
  return lots >= 20 ? "#00d4ff" : lots >= 8 ? "#00e676" : lots >= 3 ? "#ffab00" : "#ff5252";
}

const INSTRUMENT_COLORS = ["#00d4ff", "#00e676", "#b388ff", "#ffab00"];
export const instrumentColor = (i: number) => INSTRUMENT_COLORS[i % INSTRUMENT_COLORS.length];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Standalone HTML version (same look as SJ's original chart) for the Download button. */
export function sizingPlanHtml(plan: SizingPlan): string {
  const toneColor = { green: "#00e676", blue: "#00d4ff", amber: "#ffab00", red: "#ff5252", violet: "#b388ff" };
  const cards = ruleCards(plan)
    .map((c) => `<div class="card"><div class="lbl">${esc(c.label)}</div><div class="val" style="color:${toneColor[c.tone]}">${esc(c.value)}</div><div class="sub">${esc(c.sub)}</div></div>`)
    .join("");
  const blocks = plan.instruments
    .map((inst, i) => {
      const color = instrumentColor(i);
      const t1 = `<tr><th>Risk / Stop</th>${inst.stops.map((s) => `<th>${s} pt stop<span>${fmtMoney(s * inst.dollarPerPoint)}/lot</span></th>`).join("")}</tr>` +
        plan.riskAmounts.map((risk) => `<tr><td>${fmtMoney(risk)} <span class="dim">(${((risk / plan.account) * 100).toFixed(2)}%)</span></td>${inst.stops.map((s) => { const { lots, actualRisk } = lotsFor(risk, s, inst); return `<td><b style="color:${lotTone(lots)}">${fmtLots(lots, inst)}</b> <span class="dim">(${fmtMoney(actualRisk)})</span></td>`; }).join("")}</tr>`).join("");
      const t2 = `<tr><th>Stop (pts)</th><th>$ per 1 lot</th>${plan.riskPcts.map((p) => `<th>${p}%<span>${fmtMoney((plan.account * p) / 100)}</span></th>`).join("")}</tr>` +
        inst.stops.map((s) => `<tr><td>${s} pts</td><td style="color:${color}">${fmtMoney(s * inst.dollarPerPoint)}</td>${plan.riskPcts.map((p) => { const { lots, actualRisk } = lotsFor((plan.account * p) / 100, s, inst); return `<td><b style="color:${lotTone(lots)}">${fmtLots(lots, inst)} lots</b> <span class="dim">(${fmtMoney(actualRisk)})</span></td>`; }).join("")}</tr>`).join("");
      const t3 = `<tr><th>Target (pts)</th>${plan.lotSizes.map((l) => `<th>${l} lots</th>`).join("")}</tr>` +
        inst.targets.map((t) => `<tr><td>${t} pts</td>${plan.lotSizes.map((l) => `<td style="color:${color}">+${fmtMoney(profitFor(l, t, inst))}</td>`).join("")}</tr>`).join("");
      return `<section><h2 style="color:${color}">${esc(inst.symbol)} — ${esc(inst.name)}</h2>
<p class="dim">1 lot = ${fmtMoney(inst.dollarPerPoint)}/point · vol step ${inst.volStep}${inst.note ? ` · ${esc(inst.note)}` : ""}</p>
<h3>Chart 1: Lots by risk &amp; stop</h3><div class="wrap"><table>${t1}</table></div>
<h3>Chart 2: Lots at fixed risk %</h3><div class="wrap"><table>${t2}</table></div>
<h3>Chart 3: Profit at target</h3><div class="wrap"><table>${t3}</table></div></section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(plan.title)}</title><style>
body{margin:0;background:#0a0a0f;color:#e6e6e6;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:32px 16px}
main{max-width:1200px;margin:0 auto}h1{margin:0 0 4px;font-size:30px}h2{margin:32px 0 4px}h3{margin:22px 0 8px;font-size:15px}
.dim{color:#8a8f98;font-size:12px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:22px 0}
.card{background:#12131a;border:1px solid #23252f;border-radius:10px;padding:14px}.lbl{color:#8a8f98;font-size:11px;text-transform:uppercase;letter-spacing:1px}
.val{font:700 22px ui-monospace,Menlo,monospace;margin:4px 0}.sub{color:#8a8f98;font-size:12px}.wrap{overflow-x:auto;border:1px solid #23252f;border-radius:10px}
table{border-collapse:collapse;width:100%;font:13px ui-monospace,Menlo,monospace;white-space:nowrap}th,td{padding:9px 12px;text-align:left;border-bottom:1px solid #1b1d26}
th{color:#8a8f98;font-weight:600;font-size:12px}th span{display:block;font-weight:400;font-size:11px}
ul{color:#b9bec7}footer{margin-top:36px;color:#555;font-size:11px;letter-spacing:2px;text-align:center}
</style></head><body><main>
<div class="dim">${esc(plan.firm || "POSITION SIZING")} · ${fmtMoney(plan.account)} ACCOUNT</div>
<h1>${esc(plan.title)}</h1><p class="dim">Made with Ash in The Chamber. Lots rounded down to the volume step so risk never exceeds the row amount. Verify contract values on your platform.</p>
<div class="cards">${cards}</div>${blocks}
${plan.notes.length ? `<h3>Notes</h3><ul>${plan.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
<footer>THE CHAMBER · NOT FINANCIAL ADVICE</footer></main></body></html>`;
}

/** Splits an assistant reply into text and sizing-plan segments. */
export function splitSizingPlans(content: string): ({ type: "text"; text: string } | { type: "plan"; plan: SizingPlan | null; raw: string })[] {
  const out: ({ type: "text"; text: string } | { type: "plan"; plan: SizingPlan | null; raw: string })[] = [];
  const re = /```sizing-plan\s*\n?([\s\S]*?)```/g;
  let last = 0;
  for (const m of content.matchAll(re)) {
    if (m.index! > last) out.push({ type: "text", text: content.slice(last, m.index) });
    out.push({ type: "plan", plan: parseSizingPlan(m[1].trim()), raw: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < content.length) out.push({ type: "text", text: content.slice(last) });
  return out.filter((s) => s.type === "plan" || s.text.trim());
}
