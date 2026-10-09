"use client";

import { useState } from "react";
import {
  fmtLots,
  fmtMoney,
  instrumentColor,
  lotTone,
  lotsFor,
  profitFor,
  ruleCards,
  sizingPlanHtml,
  type SizingPlan as Plan,
} from "@/lib/position-sizing";

const TONE = { green: "#00e676", blue: "#00d4ff", amber: "#ffab00", red: "#ff5252", violet: "#b388ff" } as const;

function Table({ head, rows }: { head: React.ReactNode[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-chamber-border">
      <table className="w-full text-[0.72rem] font-mono whitespace-nowrap border-collapse">
        <thead>
          <tr className="text-chamber-text-muted">
            {head.map((h, i) => (
              <th key={i} className="text-left font-semibold px-3 py-2 border-b border-chamber-border">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-chamber-border/50 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-1.5">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const dim = (s: string) => <span className="text-chamber-text-dim">{s}</span>;

/** In-chat render of an Ash sizing plan. Ash supplies inputs; every number here is computed. */
export default function SizingPlan({ plan }: { plan: Plan }) {
  const [tab, setTab] = useState(0);
  const inst = plan.instruments[Math.min(tab, plan.instruments.length - 1)];
  const color = instrumentColor(tab);
  const cards = ruleCards(plan);

  function download() {
    const blob = new Blob([sizingPlanHtml(plan)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sizing-plan"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="my-2 rounded-xl border border-chamber-border bg-[#0b0c11] p-3 md:p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.62rem] tracking-[2px] uppercase text-chamber-text-dim">
            {plan.firm || "Position sizing"} · {fmtMoney(plan.account)} account
          </div>
          <div className="text-base md:text-lg font-bold text-white">{plan.title}</div>
        </div>
        <button
          onClick={download}
          className="shrink-0 rounded-lg border border-chamber-border-light px-3 py-1.5 text-[0.72rem] text-chamber-text-muted hover:border-chamber-orange/50 hover:text-chamber-orange transition-colors cursor-pointer"
        >
          Download HTML
        </button>
      </div>

      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-chamber-border bg-chamber-surface p-2.5">
              <div className="text-[0.55rem] uppercase tracking-widest text-chamber-text-dim">{c.label}</div>
              <div className="font-mono font-bold text-base" style={{ color: TONE[c.tone] }}>{c.value}</div>
              <div className="text-[0.6rem] text-chamber-text-dim leading-snug">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {plan.instruments.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {plan.instruments.map((p, i) => (
            <button
              key={p.symbol}
              onClick={() => setTab(i)}
              className="rounded-lg border px-3 py-1.5 font-mono text-[0.72rem] transition-colors cursor-pointer"
              style={
                i === tab
                  ? { borderColor: instrumentColor(i), color: instrumentColor(i), background: `${instrumentColor(i)}1f` }
                  : { borderColor: "#2a2a2a", color: "#888" }
              }
            >
              {p.symbol}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-[0.68rem] font-mono">
        <span className="rounded-md border border-chamber-border px-2 py-1" style={{ color }}>{inst.symbol} · {inst.name}</span>
        <span className="rounded-md border border-chamber-border px-2 py-1 text-chamber-text-muted">1 lot = {fmtMoney(inst.dollarPerPoint)}/point</span>
        <span className="rounded-md border border-chamber-border px-2 py-1 text-chamber-text-muted">vol step {inst.volStep}</span>
      </div>
      {inst.note && <p className="text-[0.7rem] text-chamber-text-dim -mt-2">{inst.note}</p>}

      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-white">Chart 1: Lots by risk &amp; stop</div>
        <Table
          head={["Risk / stop", ...inst.stops.map((s) => <>{s} pt {dim(`(${fmtMoney(s * inst.dollarPerPoint)}/lot)`)}</>)]}
          rows={plan.riskAmounts.map((risk) => [
            <>{fmtMoney(risk)} {dim(`(${((risk / plan.account) * 100).toFixed(2)}%)`)}</>,
            ...inst.stops.map((s) => {
              const { lots, actualRisk } = lotsFor(risk, s, inst);
              return <><b style={{ color: lotTone(lots) }}>{fmtLots(lots, inst)}</b> {dim(`(${fmtMoney(actualRisk)})`)}</>;
            }),
          ])}
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-white">Chart 2: Lots at fixed risk %</div>
        <Table
          head={["Stop", "$ per lot", ...plan.riskPcts.map((p) => <>{p}% {dim(`(${fmtMoney((plan.account * p) / 100)})`)}</>)]}
          rows={inst.stops.map((s) => [
            `${s} pts`,
            <span key="d" style={{ color }}>{fmtMoney(s * inst.dollarPerPoint)}</span>,
            ...plan.riskPcts.map((p) => {
              const { lots, actualRisk } = lotsFor((plan.account * p) / 100, s, inst);
              return <><b style={{ color: lotTone(lots) }}>{fmtLots(lots, inst)} lots</b> {dim(`(${fmtMoney(actualRisk)})`)}</>;
            }),
          ])}
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-white">Chart 3: Profit at target</div>
        <Table
          head={["Target", ...plan.lotSizes.map((l) => `${l} lots`)]}
          rows={inst.targets.map((t) => [
            `${t} pts`,
            ...plan.lotSizes.map((l) => <span key={l} style={{ color }}>+{fmtMoney(profitFor(l, t, inst))}</span>),
          ])}
        />
      </div>

      {plan.notes.length > 0 && (
        <ul className="list-disc pl-5 text-[0.75rem] text-chamber-text-muted space-y-0.5">
          {plan.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <p className="text-[0.62rem] text-chamber-text-dim">
        Lots are rounded down to the volume step so risk never exceeds the row amount. Verify contract values on your platform. Not financial advice.
      </p>
    </div>
  );
}
