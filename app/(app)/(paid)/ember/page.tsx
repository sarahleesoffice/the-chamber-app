"use client";

import AgentChat, { AgentConfig } from "@/components/AgentChat";

const EMBER: AgentConfig = {
  bot: "ember",
  name: "Ember",
  role: "Technical SMC Mentor",
  blurb:
    "Your SMC technical mentor. Ask for live quotes, market structure, concept breakdowns, the macro picture, or what's on today's economic calendar.",
  icon: "local_fire_department",
  accent: "#e8651a",
  placeholder: "Ask Ember about price, structure, or a concept...",
  suggested: [
    "What's NQ trading at right now?",
    "Explain order blocks and how to use them",
    "What's on the economic calendar today?",
    "What's the macro picture for gold?",
  ],
};

export default function EmberPage() {
  return <AgentChat config={EMBER} />;
}
