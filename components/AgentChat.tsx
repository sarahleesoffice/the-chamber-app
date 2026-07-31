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

interface ConvoMeta {
  id: string;
  title: string;
  lastAt: string;
  count: number;
}

function newConvoId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function convoWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function AgentChat({ config }: { config: AgentConfig }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [convos, setConvos] = useState<ConvoMeta[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Load the conversation archive, then open the most recent conversation
  // (or a fresh one if there's no history yet).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: ConvoMeta[] = [];
      try {
        const res = await fetch(`/api/agents/${config.bot}/conversations`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.conversations)) list = data.conversations;
        }
      } catch { /* archive is best-effort */ }
      if (cancelled) return;
      setConvos(list);
      setActiveId(list.length > 0 ? list[0].id : newConvoId());
    })();
    return () => { cancelled = true; };
  }, [config.bot]);

  // Load the selected conversation's messages. The agent's backend memory is
  // scoped per conversation, so reopening one picks its context back up.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setHistoryLoading(true);
    setMessages([]);
    (async () => {
      try {
        const res = await fetch(`/api/agents/${config.bot}/history?conversation=${activeId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data.messages)) return;
        setMessages(
          data.messages.map((m: { role: "user" | "assistant"; content: string; timestamp: string }) => ({
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
          }))
        );
      } catch { /* best-effort */ }
      finally { if (!cancelled) setHistoryLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [activeId, config.bot]);

  function startNewChat() {
    setPickerOpen(false);
    setActiveId(newConvoId());
    setInput("");
    inputRef.current?.focus();
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || !activeId) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed, timestamp: new Date() }]);
    setInput("");
    inputRef.current?.focus();
    setLoading(true);

    // Keep the archive list in sync: new conversations appear once the first
    // message is sent; existing ones bubble to the top.
    setConvos((prev) => {
      const rest = (prev ?? []).filter((c) => c.id !== activeId);
      const existing = (prev ?? []).find((c) => c.id === activeId);
      return [
        {
          id: activeId,
          title: existing?.title ?? trimmed.slice(0, 60),
          lastAt: new Date().toISOString(),
          count: (existing?.count ?? 0) + 1,
        },
        ...rest,
      ];
    });

    try {
      const res = await fetch(`/api/agents/${config.bot}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversationId: activeId }),
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
    <div className="flex flex-col h-[calc(100dvh-136px)] md:h-[calc(100vh-64px)]">
      {/* Header — desktop only; the mobile app bar already names the agent */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b hidden md:flex items-center gap-3" style={{ borderColor: "#1e1a17" }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#1a1210", border: `2px solid ${config.accent}` }}>
          <span className="material-icons-outlined" style={{ color: config.accent, fontSize: "20px" }}>{config.icon}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{config.name}</h1>
          <p className="text-sm mt-0.5" style={{ color: "#888" }}>{config.role}</p>
        </div>
      </div>

      {/* Archive bar — browse past conversations or start a new one */}
      <div
        className="shrink-0 relative flex items-center gap-2.5 px-3 md:px-6 py-2 border-b"
        style={{ borderColor: "#1e1a17", background: "linear-gradient(180deg, #100d0b, #0b0a09)" }}
      >
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer hover:brightness-125"
          style={{
            border: pickerOpen ? `1px solid ${config.accent}66` : "1px solid #2a2a2a",
            color: pickerOpen ? "#fff" : "#aaa",
            backgroundColor: pickerOpen ? `${config.accent}14` : "rgba(255,255,255,0.02)",
          }}
        >
          <span className="material-icons-outlined" style={{ fontSize: "14px", color: config.accent, opacity: 0.9 }}>forum</span>
          Chats
          {convos && convos.length > 0 && (
            <span
              className="text-[0.62rem] font-bold px-1.5 rounded-full"
              style={{ backgroundColor: `${config.accent}22`, color: config.accent }}
            >
              {convos.length}
            </span>
          )}
        </button>
        <span className="flex-1 truncate text-xs tracking-wide" style={{ color: "#7a7a7a" }}>
          {(activeId && convos?.find((c) => c.id === activeId)?.title) || "New conversation"}
        </span>
        <button
          onClick={startNewChat}
          className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full transition-all cursor-pointer hover:brightness-125"
          style={{
            border: `1px solid ${config.accent}55`,
            color: config.accent,
            backgroundColor: `${config.accent}10`,
            boxShadow: `0 0 12px ${config.accent}14`,
          }}
        >
          <span className="material-icons-outlined" style={{ fontSize: "14px" }}>add</span>
          New chat
        </button>

        {pickerOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
            <div
              className="absolute left-2 md:left-6 top-full mt-1.5 z-20 w-80 max-w-[88vw] max-h-80 overflow-y-auto rounded-xl shadow-2xl"
              style={{ backgroundColor: "#121110", border: "1px solid #2a2520", boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 20px ${config.accent}0a` }}
            >
              <p
                className="px-4 pt-3 pb-1.5 text-[0.58rem] font-semibold uppercase"
                style={{ color: `${config.accent}99`, letterSpacing: "0.25em" }}
              >
                Conversations
              </p>
              {!convos || convos.length === 0 ? (
                <p className="text-xs px-4 pb-4 pt-1" style={{ color: "#666" }}>No past conversations yet.</p>
              ) : (
                <div className="pb-1.5">
                  {convos.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setActiveId(c.id); setPickerOpen(false); }}
                      className="w-full text-left px-4 py-2.5 transition-colors cursor-pointer hover:bg-white/[0.04]"
                      style={{
                        borderLeft: c.id === activeId ? `2px solid ${config.accent}` : "2px solid transparent",
                        backgroundColor: c.id === activeId ? `${config.accent}0d` : "transparent",
                      }}
                    >
                      <span className="block text-xs truncate" style={{ color: c.id === activeId ? "#fff" : "#c5c5c5" }}>
                        {c.title}
                      </span>
                      <span className="block text-[0.65rem] mt-0.5" style={{ color: "#5e5e5e" }}>
                        {convoWhen(c.lastAt)} · {c.count} message{c.count !== 1 ? "s" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-4" style={{ backgroundColor: "#0a0a0a" }}>
        {messages.length === 0 && historyLoading ? null : messages.length === 0 ? (
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
                className={`${msg.role === "user" ? "max-w-[85%] md:max-w-[70%]" : "max-w-[95%] md:max-w-[80%]"} px-4 py-3 md:px-5 md:py-4 rounded-xl`}
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
      <div className="shrink-0 px-3 md:px-6 py-3 md:py-4 border-t" style={{ borderColor: "#1e1a17", backgroundColor: "#0a0a0a" }}>
        <div className="flex items-center gap-2 md:gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={config.placeholder}
            className="flex-1 min-w-0 text-sm px-3 md:px-4 py-3 rounded-lg outline-none transition-colors"
            style={{ backgroundColor: "#141414", border: "1px solid #2a2a2a", color: "#e0e0e0" }}
            onFocus={(e) => { e.currentTarget.style.borderColor = config.accent; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#2a2a2a"; }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 px-4 md:px-5 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: input.trim() ? config.accent : "#3a2a1a", color: "#fff" }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Footer — desktop only; on phones every pixel goes to the chat */}
      <div className="shrink-0 text-center py-3 border-t hidden md:block" style={{ borderColor: "#1e1a17" }}>
        <p className="tracking-widest" style={{ color: "#444", fontSize: "9px" }}>
          {config.bot === "ember"
            ? "EMBER · TECHNICAL SMC MENTOR · LIVE DATA, CHARTS & CONCEPTS"
            : "AMBER · MENTAL GAME COACH · TRADING PSYCHOLOGY"}
        </p>
      </div>
    </div>
  );
}
