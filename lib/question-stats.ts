/**
 * Aggregates public.message_tags rows (written nightly by the Mac mini's
 * question_tagger.py) into what the admin "What people ask" page shows.
 * Pure — no I/O.
 */

export interface MessageTagRow {
  asked_at: string;
  bot_name: string;
  user_id: string | null;
  is_owner: boolean;
  channel_kind: string;
  topic: string;
  difficulty: string;
  best_agent: string;
  needs_live_data: boolean;
  summary: string | null;
}

export const TOPICS = [
  "concept",
  "live_market",
  "trade_review",
  "risk_sizing",
  "psychology",
  "platform_help",
  "personal_task",
  "small_talk",
  "off_topic",
] as const;

export const TOPIC_LABELS: Record<string, string> = {
  concept: "Trading concepts",
  live_market: "Live market / news",
  trade_review: "Own trades & stats",
  risk_sizing: "Risk & sizing",
  psychology: "Psychology",
  platform_help: "App / bot help",
  personal_task: "Personal tasks",
  small_talk: "Small talk",
  off_topic: "Off-topic",
};

export const DIFFICULTIES = ["simple", "standard", "tools", "deep"] as const;

export const DIFFICULTY_LABELS: Record<string, string> = {
  simple: "Simple",
  standard: "Standard",
  tools: "Needs tools",
  deep: "Deep",
};

/** Which stored bot names count as each agent in the tagger's best_agent field. */
const AGENT_OF_BOT: Record<string, string> = { ember: "ember", amber: "amber", chamber_ash: "ash", ash: "ash" };

export const BOT_LABELS: Record<string, string> = {
  ember: "Ember",
  amber: "Amber",
  chamber_ash: "Ash (app)",
  ash: "Ash (Discord)",
};

export interface QuestionReport {
  totals: {
    messages: number;
    members: number;
    simpleShare: number; // 0–100
    liveShare: number; // 0–100
    misroutedShare: number; // 0–100, of messages with a best agent
  };
  byTopic: { topic: string; label: string; count: number; share: number }[];
  byBot: { bot: string; label: string; total: number; difficulty: Record<string, number>; misrouted: number }[];
  misroutes: { from: string; to: string; count: number }[];
  recent: { at: string; bot: string; topic: string; difficulty: string; channel: string; summary: string }[];
}

const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

export function buildQuestionReport(rows: MessageTagRow[]): QuestionReport {
  const total = rows.length;

  const topicCounts = new Map<string, number>();
  for (const r of rows) topicCounts.set(r.topic, (topicCounts.get(r.topic) || 0) + 1);
  const byTopic = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, label: TOPIC_LABELS[topic] || topic, count, share: pct(count, total) }))
    .sort((a, b) => b.count - a.count);

  const bots = new Map<string, QuestionReport["byBot"][number]>();
  const misroutes = new Map<string, number>();
  let routable = 0;
  let misrouted = 0;
  for (const r of rows) {
    const b = bots.get(r.bot_name) || {
      bot: r.bot_name,
      label: BOT_LABELS[r.bot_name] || r.bot_name,
      total: 0,
      difficulty: Object.fromEntries(DIFFICULTIES.map((d) => [d, 0])),
      misrouted: 0,
    };
    b.total++;
    b.difficulty[r.difficulty] = (b.difficulty[r.difficulty] || 0) + 1;
    if (r.best_agent && r.best_agent !== "none") {
      routable++;
      const here = AGENT_OF_BOT[r.bot_name];
      if (here && here !== r.best_agent) {
        misrouted++;
        b.misrouted++;
        const k = `${BOT_LABELS[r.bot_name] || r.bot_name}→${r.best_agent}`;
        misroutes.set(k, (misroutes.get(k) || 0) + 1);
      }
    }
    bots.set(r.bot_name, b);
  }

  return {
    totals: {
      messages: total,
      members: new Set(rows.map((r) => r.user_id).filter(Boolean)).size,
      simpleShare: pct(rows.filter((r) => r.difficulty === "simple").length, total),
      liveShare: pct(rows.filter((r) => r.needs_live_data).length, total),
      misroutedShare: pct(misrouted, routable),
    },
    byTopic,
    byBot: [...bots.values()].sort((a, b) => b.total - a.total),
    misroutes: [...misroutes.entries()]
      .map(([k, count]) => {
        const [from, to] = k.split("→");
        return { from, to: to.charAt(0).toUpperCase() + to.slice(1), count };
      })
      .sort((a, b) => b.count - a.count),
    recent: [...rows]
      .sort((a, b) => b.asked_at.localeCompare(a.asked_at))
      .slice(0, 40)
      .map((r) => ({
        at: r.asked_at,
        bot: BOT_LABELS[r.bot_name] || r.bot_name,
        topic: TOPIC_LABELS[r.topic] || r.topic,
        difficulty: DIFFICULTY_LABELS[r.difficulty] || r.difficulty,
        channel: r.channel_kind,
        summary: r.summary || "",
      })),
  };
}
