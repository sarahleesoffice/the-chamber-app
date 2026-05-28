"use client";

import AgentChat, { AgentConfig } from "@/components/AgentChat";

const AMBER: AgentConfig = {
  bot: "amber",
  name: "Amber",
  role: "Mental Game Coach",
  blurb:
    "Your mental game coach for when the setups are fine but execution breaks down — tilt, FOMO, revenge trades, hesitation. She asks the question you're avoiding.",
  icon: "self_improvement",
  accent: "#eab308",
  placeholder: "Tell Amber what's going on in your head...",
  suggested: [
    "I keep revenge trading after a loss",
    "I freeze when it's time to enter",
    "How do I deal with FOMO?",
    "I'm tilting after a bad morning",
  ],
};

export default function AmberPage() {
  return <AgentChat config={AMBER} />;
}
