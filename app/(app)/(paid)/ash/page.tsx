"use client";

import AgentChat, { AgentConfig } from "@/components/AgentChat";

const ASH: AgentConfig = {
  bot: "ash",
  name: "Ash",
  role: "Performance Overseer",
  blurb:
    "Ash reads your Edge Report, journal, and what you've told Ember and Amber, then tells you straight what's working and what to fix.",
  icon: "insights",
  accent: "#94a3b8",
  placeholder: "Ask Ash how you're really doing...",
  suggested: [
    "Review my trading. What's working and what isn't?",
    "Am I sizing up after losses?",
    "Are my longs or shorts carrying me?",
    "Is my method actually profitable yet?",
  ],
};

export default function AshPage() {
  return <AgentChat config={ASH} />;
}
