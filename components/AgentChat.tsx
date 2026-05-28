"use client";

import { useState, useRef, useEffect } from "react";

export interface AgentConfig {
  bot: "ember" | "amber";
  name: string;
  role: string;
  blurb: string;
  icon: string; // material-icons-outlined glyph name
  accent: string; // hex
  placeholder: string;
  suggested: string[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
}

/* Renders one assistant reply with light markdown formatting, matching the
   AI SMC Chat styling so the agents feel native to the app. */
function AssistantMessage({ content, accent }: { content: string; accent: string }) {
  return (
    <div className="text-sm leading-relaxed space-y-3" style={{ color: "#d0d0d0" }}>
      {content.split("\n\n").map((block, bi) => {
        const lines = block.split("\n").filter(Boolean);

        if (/^#{1,3}\s/.test(block)) {
          const text = block.replace(/^#{1,3}\s*/, "");
          return (
            <div key={bi} className="flex items-center gap-2 mt-2 mb-1">
              <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accent }} />
              <span className="font-semibold text-white text-sm">{text.replace(/\*\*/g, "")}</span>
            </div>
          );
        }
        if (/^\*\*[^*]+\*\*$/.test(block.trim())) {
          const text = block.replace(/\*\*/g, "").trim();
          if (/score|rating|grade/i.test(text)) {
            return (
              <div key={bi} className="flex items-center gap-2 px-3 py-2 rounded-lg mt-1" style={{ backgroundColor: "#1a1210", border: `1px solid ${accent}40` }}>
                <span style={{ color: accent, fontSize: "16px" }}>◆</span>
                <span className="font-bold text-white">{text}</span>
              </div>
            );
          }
          return (
            <div key={bi} className="flex items-center gap-2 mt-2 mb-1">
              <div className="w-1 h-4 rounded-full" style={{ backgroundColor: accent }} />
              <span className="font-semibold text-white">{text}</span>
            </div>
          );
        }
        if (lines.some((l) => /^[-•]\s/.test(l))) {
          return (
            <ul key={bi} className="space-y-1.5 ml-2">
              {lines.map((item, ii) => {
                if (/^[-•]\s/.test(item)) {
                  const text = item.replace(/^[-•]\s*/, "");
                  return (
                    <li key={ii} className="flex gap-2.5 items-start">
                      <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                      <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} />
                    </li>
                  );
                }
                return <li key={ii} className="font-medium text-white -mb-0.5">{item.replace(/\*\*/g, "")}</li>;
              })}
            </ul>
          );
        }
        if (lines.some((l) => /^\d+[.)]\s/.test(l))) {
          return (
            <ol key={bi} className="space-y-1.5 ml-2">
              {lines.map((item, ii) => {
                if (/^\d+[.)]\s/.test(item)) {
                  const num = item.match(/^(\d+)/)?.[1] || String(ii + 1);
                  const text = item.replace(/^\d+[.)]\s*/, "");
                  return (
                    <li key={ii} className="flex gap-2.5 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: `${accent}20`, color: accent }}>{num}</span>
                      <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} />
                    </li>
                  );
                }
                return <li key={ii} className="font-medium text-white">{item.replace(/\*\*/g, "")}</li>;
              })}
            </ol>
          );
        }
        return <p key={bi} dangerouslySetInnerHTML={{ __html: block.replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} />;
      })}
    </div>
  );
}

export default function AgentChat({ config }: { config: AgentConfig }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed, timestamp: new Date() }]);
    setInput("");
    inputRef.current?.focus();
    setLoading(true);

    try {
      const res = await fetch(`/api/agents/${config.bot}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.error || "Something went wrong.", timestamp: new Date(), isError: true }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply, timestamp: new Date() }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error. Please try again.", timestamp: new Date(), isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b flex items-center gap-3" style={{ borderColor: "#1e1a17" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#1a1210", border: `2px solid ${config.accent}` }}>
          <span className="material-icons-outlined" style={{ color: config.accent, fontSize: "20px" }}>{config.icon}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
          <p className="text-sm mt-0.5" style={{ color: "#888" }}>{config.role}</p>
        </div>
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ backgroundColor: "#0a0a0a" }}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#1a1210", border: `2px solid ${config.accent}` }}>
              <span className="material-icons-outlined" style={{ color: config.accent, fontSize: "30px" }}>{config.icon}</span>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">{config.name} — {config.role}</h2>
            <p className="text-sm mb-6 max-w-md" style={{ color: "#888" }}>{config.blurb}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {config.suggested.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-4 py-3 rounded-lg transition-colors cursor-pointer"
                  style={{ backgroundColor: "#141414", border: "1px solid #2a2a2a", color: "#ccc" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = config.accent; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#ccc"; }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`${msg.role === "user" ? "max-w-[70%]" : "max-w-[80%]"} px-5 py-4 rounded-xl`}
                style={{
                  backgroundColor: msg.role === "user" ? "#1a1210" : "#111",
                  borderLeft: msg.role === "user"
                    ? "3px solid #e8651a"
                    : `3px solid ${msg.isError ? "#ef4444" : config.accent}`,
                }}
              >
                {msg.role === "assistant" ? (
                  <AssistantMessage content={msg.content} accent={config.accent} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap" style={{ color: "#e0e0e0" }}>{msg.content}</p>
                )}
                <p className="text-xs mt-2" style={{ color: "#555" }}>{formatTime(msg.timestamp)}</p>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[75%] px-4 py-3 rounded-lg" style={{ backgroundColor: "#141414", borderLeft: `2px solid ${config.accent}` }}>
              <p className="text-sm animate-pulse" style={{ color: "#888" }}>{config.name} is thinking...</p>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-6 py-4 border-t" style={{ borderColor: "#1e1a17", backgroundColor: "#0a0a0a" }}>
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={config.placeholder}
            className="flex-1 text-sm px-4 py-3 rounded-lg outline-none transition-colors"
            style={{ backgroundColor: "#141414", border: "1px solid #2a2a2a", color: "#e0e0e0" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = config.accent; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 px-5 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: input.trim() ? config.accent : "#3a2a1a", color: "#fff" }}
          >
            Send
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setInput(""); inputRef.current?.focus(); }}
              className="shrink-0 text-xs px-3 py-3 rounded-lg transition-colors cursor-pointer"
              style={{ backgroundColor: "transparent", border: "1px solid #2a2a2a", color: "#666" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#555"; e.currentTarget.style.color = "#aaa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; e.currentTarget.style.color = "#666"; }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 text-center py-3 border-t" style={{ borderColor: "#1e1a17" }}>
        <p className="tracking-widest" style={{ color: "#444", fontSize: "9px" }}>
          {config.bot === "ember"
            ? "EMBER · TECHNICAL SMC MENTOR · LIVE DATA, CHARTS & CONCEPTS"
            : "AMBER · MENTAL GAME COACH · TRADING PSYCHOLOGY"}
        </p>
      </div>
    </div>
  );
}
