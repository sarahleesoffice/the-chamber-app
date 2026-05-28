"use client";

import { useState, useEffect } from "react";

const KILL_ZONES = [
  {
    name: "Asia Session",
    time: "8:00 PM — 12:00 AM EST",
    color: "#3b82f6",
    phase: "Accumulation",
    description: "The range-building session. Price consolidates and forms the Asia range that London will target.",
    tips: [
      "Mark Asia high and Asia low before London opens",
      "This range IS the liquidity that smart money will sweep",
      "Do not trade this session — observe and prepare",
      "Look for equal highs/lows forming within this range",
    ],
  },
  {
    name: "London Open",
    time: "2:00 AM — 5:00 AM EST",
    color: "#e8651a",
    phase: "Manipulation",
    description: "The Judas Swing. London sweeps one side of the Asia range to trap retail traders before the real move.",
    tips: [
      "Wait for Asia range sweep (high or low taken)",
      "Look for MSS + displacement after the sweep",
      "FVGs created after the sweep are your entries",
      "This is where the Power of 3 manipulation occurs",
    ],
  },
  {
    name: "New York Open",
    time: "7:00 AM — 10:00 AM EST",
    color: "#22c55e",
    phase: "Distribution",
    description: "The highest-volume session. NY either continues London's move or reverses it. This is where the real money is made.",
    tips: [
      "9:30 AM: NYSE open — expect volatility spike",
      "9:50—10:10 AM: The 10 AM macro reversal window",
      "Silver Bullet: 10:00—11:00 AM for FVG entries",
      "If London and NY agree, ride the trend. If not, wait for confirmation.",
    ],
  },
  {
    name: "London Close",
    time: "10:00 AM — 12:00 PM EST",
    color: "#a855f7",
    phase: "End of Day",
    description: "The last high-probability window. London Close setups often form during the 1:50—2:10 PM macro.",
    tips: [
      "PM Silver Bullet: 2:00—3:00 PM EST",
      "1:50—2:10 PM macro for final setups",
      "Price often retraces to fill FVGs from the AM session",
      "Reduce risk — the day is winding down",
    ],
  },
];

const SMC_MACROS = [
  { name: "9:50 — 10:10 AM", desc: "The 10 AM reversal macro", color: "#22c55e" },
  { name: "10:50 — 11:10 AM", desc: "Continuation or reversal", color: "#e8651a" },
  { name: "1:50 — 2:10 PM", desc: "London Close setup", color: "#a855f7" },
];

const SILVER_BULLETS = [
  { name: "AM Silver Bullet", time: "10:00 — 11:00 AM EST", desc: "Stronger window — look for FVGs with HTF bias" },
  { name: "PM Silver Bullet", time: "2:00 — 3:00 PM EST", desc: "Secondary window — only trade with clear bias" },
];

export default function SessionsPage() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Convert to EST
  const estHour = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();
  const estMin = now.getMinutes();
  const estTime = estHour + estMin / 60;

  let activeSession = "No Active Kill Zone";
  let activeColor = "#555";
  if (estTime >= 20 || estTime < 0) { activeSession = "Asia Session"; activeColor = "#3b82f6"; }
  else if (estTime >= 2 && estTime < 5) { activeSession = "London Open"; activeColor = "#e8651a"; }
  else if (estTime >= 7 && estTime < 10) { activeSession = "New York Open"; activeColor = "#22c55e"; }
  else if (estTime >= 10 && estTime < 12) { activeSession = "London Close"; activeColor = "#a855f7"; }

  return (
    <div className="space-y-8">
      <h1
        className="text-3xl font-bold tracking-[3px] text-chamber-orange"
        style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
      >
        SESSIONS
      </h1>

      {/* Current session status */}
      <div className="bg-chamber-surface border border-chamber-border rounded-xl p-6 text-center">
        <div className="text-chamber-text-muted text-sm mb-2">Current Session</div>
        <div className="text-2xl font-bold" style={{ color: activeColor }}>
          {activeSession !== "No Active Kill Zone" && (
            <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 animate-pulse" style={{ background: activeColor }} />
          )}
          {activeSession}
        </div>
        <div className="text-chamber-text-dim text-sm mt-1">
          {now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" })} EST
        </div>
      </div>

      {/* Kill Zone Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {KILL_ZONES.map((kz) => (
          <div
            key={kz.name}
            className="bg-chamber-surface border rounded-xl p-5 relative overflow-hidden"
            style={{ borderColor: `${kz.color}30` }}
          >
            <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${kz.color}, transparent)` }} />
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-lg text-white">{kz.name}</h3>
                <span className="text-[0.8rem]" style={{ color: kz.color }}>{kz.time}</span>
              </div>
              <span
                className="text-[0.65rem] font-bold tracking-wider px-2.5 py-1 rounded-full border"
                style={{ color: kz.color, borderColor: `${kz.color}40`, background: `${kz.color}10` }}
              >
                {kz.phase}
              </span>
            </div>
            <p className="text-chamber-text-muted text-[0.85rem] leading-relaxed mb-3">{kz.description}</p>
            <ul className="space-y-1">
              {kz.tips.map((tip, i) => (
                <li key={i} className="text-[0.8rem] text-chamber-text-dim flex gap-2">
                  <span style={{ color: kz.color }}>•</span> {tip}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* SMC Macros */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          SMC MACROS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SMC_MACROS.map((m) => (
            <div key={m.name} className="bg-chamber-surface border border-chamber-border rounded-lg p-4 text-center">
              <div className="font-bold text-white text-lg">{m.name}</div>
              <div className="text-[0.8rem] mt-1" style={{ color: m.color }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Silver Bullets */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          SILVER BULLETS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SILVER_BULLETS.map((sb) => (
            <div key={sb.name} className="bg-chamber-surface border border-chamber-border rounded-lg p-4">
              <div className="font-bold text-white">{sb.name}</div>
              <div className="text-chamber-orange text-sm">{sb.time}</div>
              <div className="text-chamber-text-muted text-[0.82rem] mt-1">{sb.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Power of 3 */}
      <section>
        <h2
          className="text-xl font-bold tracking-wider text-chamber-orange mb-3"
          style={{ textShadow: "0 0 20px rgba(232,101,26,0.4)" }}
        >
          POWER OF 3 (AMD)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-500/8 border border-blue-500/20 rounded-lg p-4 text-center">
            <div className="text-blue-400 font-bold text-lg">Accumulation</div>
            <div className="text-chamber-text-muted text-sm">Asia Session</div>
            <div className="text-chamber-text-dim text-[0.75rem] mt-1">Range building • Liquidity forming</div>
          </div>
          <div className="bg-chamber-orange/8 border border-chamber-orange/20 rounded-lg p-4 text-center">
            <div className="text-chamber-orange font-bold text-lg">Manipulation</div>
            <div className="text-chamber-text-muted text-sm">London Open</div>
            <div className="text-chamber-text-dim text-[0.75rem] mt-1">Judas Swing • Liquidity sweep</div>
          </div>
          <div className="bg-green-500/8 border border-green-500/20 rounded-lg p-4 text-center">
            <div className="text-green-400 font-bold text-lg">Distribution</div>
            <div className="text-chamber-text-muted text-sm">New York Open</div>
            <div className="text-chamber-text-dim text-[0.75rem] mt-1">Real move • Smart money delivery</div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center mt-8">
        <p className="text-[#333] text-[0.65rem] tracking-wider">BASED ON SMC CONCEPTS</p>
        <p className="text-[#292929] text-[0.58rem] mt-1">THIS IS NOT FINANCIAL ADVICE</p>
      </div>
    </div>
  );
}
