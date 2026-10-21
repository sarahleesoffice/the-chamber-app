import { Fragment } from "react";

// Markdown links [label](url) or bare URLs (trailing punctuation left out of the link)
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,!?:;'"])/g;

function friendlyLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host === "discord.com" || host.endsWith(".discord.com")) return "Open in Discord";
    if (host.endsWith("youtube.com") || host === "youtu.be") return "Watch on YouTube";
    if (host.endsWith("gamma.app")) return "View study deck";
    return host;
  } catch {
    return url;
  }
}

/**
 * Renders AI reply text with links as short tappable labels instead of raw
 * URLs, and drops leftover markdown bold markers. Built from React elements
 * (no innerHTML), so model output can't inject markup.
 */
export default function LinkedText({ text }: { text: string }) {
  const clean = text.replace(/\*\*/g, "");
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of clean.matchAll(LINK)) {
    const url = m[2] || m[3];
    const label = m[1] && !/^https?:\/\//.test(m[1]) ? m[1] : friendlyLabel(url);
    parts.push(clean.slice(last, m.index));
    parts.push(
      <a
        key={m.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium text-chamber-orange hover:underline"
        style={{ background: "rgba(232,101,26,0.12)", border: "1px solid rgba(232,101,26,0.3)" }}
      >
        {label} ↗
      </a>
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(clean.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}
