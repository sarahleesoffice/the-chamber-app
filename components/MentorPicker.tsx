"use client";

import { MENTOR_IDS, MENTOR_INFO, type MentorId } from "@/lib/mentors";

/** Ember / Amber / Ash tabs. Fills the row on phones; compact on desktop. */
export default function MentorPicker({
  value,
  onChange,
  compact = false,
}: {
  value: MentorId;
  onChange: (m: MentorId) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-2" role="tablist" aria-label="Mentor">
      {MENTOR_IDS.map((id) => {
        const m = MENTOR_INFO[id];
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`flex items-center justify-center gap-2 rounded-lg transition-all cursor-pointer ${
              compact ? "px-3 py-1.5 text-xs" : "flex-1 md:flex-none px-4 py-2.5 text-sm"
            }`}
            style={{
              backgroundColor: active ? `${m.accent}22` : "#141414",
              border: `1px solid ${active ? m.accent : "#2a2a2a"}`,
              color: active ? m.accent : "#888",
              boxShadow: active ? `0 0 14px ${m.accent}33` : undefined,
            }}
          >
            <span className="material-icons-outlined" style={{ fontSize: compact ? "15px" : "18px" }}>
              {m.icon}
            </span>
            <span className="font-semibold">{m.name}</span>
          </button>
        );
      })}
    </div>
  );
}
