"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface StudyCard {
  title: string;
  category: string;
  gamma_url?: string;
  content?: string;
}

interface DiscordLink {
  concept: string;
  thread_url: string;
}

interface SourceRef {
  video: string;
  url?: string;
}

interface StudyMaterials {
  cards?: StudyCard[];
  discord?: DiscordLink[];
  sources?: SourceRef[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  studyMaterials?: StudyMaterials;
}

/* ── Helper: extract image path from content field ── */
function getSlideImage(content?: string): string | null {
  if (!content) return null;
  if (content.startsWith("IMG:")) {
    const newlineIdx = content.indexOf("\n");
    return newlineIdx > 4 ? content.slice(4, newlineIdx) : content.slice(4);
  }
  return null;
}

/* ── Study Materials visual section ── */
function StudyMaterialsSection({ data }: { data: StudyMaterials }) {
  const [cardIndex, setCardIndex] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const hasCards = data.cards && data.cards.length > 0;
  const hasDiscord = data.discord && data.discord.length > 0;
  const hasSources = data.sources && data.sources.length > 0;

  if (!hasCards && !hasDiscord && !hasSources) return null;

  return (
    <div
      className="mt-3 pt-3 space-y-3"
      style={{ borderTop: "1px solid #1e1a17" }}
    >
      {/* ── Study Cards ── */}
      {hasCards && (
        <div>
          <p
            className="text-[10px] font-semibold tracking-widest mb-2"
            style={{ color: "#e8651a", fontVariant: "small-caps" }}
          >
            STUDY MATERIALS
          </p>
          <div
            className="rounded-lg p-4 relative"
            style={{ backgroundColor: "#111", border: "1px solid #1e1a17" }}
          >
            {/* Nav arrows */}
            {data.cards!.length > 1 && (
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() =>
                    setCardIndex((prev) =>
                      prev === 0 ? data.cards!.length - 1 : prev - 1
                    )
                  }
                  className="w-7 h-7 rounded flex items-center justify-center text-xs cursor-pointer"
                  style={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    color: "#888",
                  }}
                >
                  &lt;
                </button>
                <span className="text-[10px]" style={{ color: "#555" }}>
                  {cardIndex + 1} / {data.cards!.length}
                </span>
                <button
                  onClick={() =>
                    setCardIndex((prev) =>
                      prev === data.cards!.length - 1 ? 0 : prev + 1
                    )
                  }
                  className="w-7 h-7 rounded flex items-center justify-center text-xs cursor-pointer"
                  style={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #2a2a2a",
                    color: "#888",
                  }}
                >
                  &gt;
                </button>
              </div>
            )}

            {/* Current card */}
            {(() => {
              const card = data.cards![cardIndex];
              const slideImage = getSlideImage(card.content);
              return (
                <div key={cardIndex}>
                  {/* Slide image */}
                  {slideImage && (
                    <div className="mb-3 rounded-lg overflow-hidden" style={{ border: "1px solid #1e1a17" }}>
                      <img
                        src={slideImage}
                        alt={card.title}
                        className="w-full h-auto"
                        style={{ display: "block" }}
                      />
                    </div>
                  )}
                  <p
                    className="font-semibold text-sm"
                    style={{ color: "#e8651a" }}
                  >
                    {card.title}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "#888" }}
                  >
                    {card.category}
                  </p>
                  {card.gamma_url && (
                    <a
                      href={card.gamma_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-2 text-xs px-3 py-1.5 rounded-md transition-colors"
                      style={{
                        backgroundColor: "#1a1210",
                        border: "1px solid #e8651a40",
                        color: "#e8651a",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#2a1a10";
                        e.currentTarget.style.color = "#ff7e33";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#1a1210";
                        e.currentTarget.style.color = "#e8651a";
                      }}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                      View Gamma Deck
                    </a>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Discord links ── */}
      {hasDiscord && (
        <div className="flex flex-wrap gap-2">
          {data.discord!.map((d, i) => (
            <a
              key={i}
              href={d.thread_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors"
              style={{
                backgroundColor: "#141414",
                border: "1px solid #2a2a2a",
                color: "#888",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#5865F2";
                e.currentTarget.style.color = "#a8b1ff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2a2a2a";
                e.currentTarget.style.color = "#888";
              }}
            >
              {/* Discord icon */}
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Study in Discord
            </a>
          ))}
        </div>
      )}

      {/* ── SMC Video Sources (collapsible) ── */}
      {hasSources && (
        <div>
          <button
            onClick={() => setSourcesOpen((prev) => !prev)}
            className="flex items-center gap-1.5 w-full text-left cursor-pointer"
          >
            <svg
              className="w-3 h-3 transition-transform"
              style={{
                color: "#888",
                transform: sourcesOpen ? "rotate(90deg)" : "rotate(0deg)",
              }}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <p
              className="text-[10px] font-semibold tracking-widest"
              style={{ color: "#888", fontVariant: "small-caps" }}
            >
              SEARCH SMC VIDEOS ({data.sources!.length})
            </p>
          </button>
          {sourcesOpen && (
            <div className="space-y-1 mt-1.5 ml-4">
              {data.sources!.map((s, i) => (
                <a
                  key={i}
                  href={`https://www.youtube.com/results?search_query=SMC+${encodeURIComponent(s.video)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs flex items-center gap-1.5 transition-colors hover:underline"
                  style={{ color: "#666" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#e8651a"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#666"; }}
                >
                  <span>🔍</span>
                  Search: &quot;{s.video}&quot;
                  <svg className="w-2.5 h-2.5 shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const SUGGESTED_QUESTIONS = [
  "What is an Order Block?",
  "Explain the Silver Bullet setup",
  "How does Power of 3 work?",
  "What are SMC Macros?",
];

const PLACEHOLDER_REPLY =
  "AI chat requires API key configuration. Go to Settings to add your Claude or Gemini API key.";

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  // Check for API key on load
  useEffect(() => {
    async function checkKey() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setHasApiKey(false); return; }
      const { data: keys } = await supabase
        .from("user_api_keys")
        .select("provider")
        .eq("user_id", user.id);
      setHasApiKey(!!keys && keys.length > 0);
    }
    checkKey();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsg: Message = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    inputRef.current?.focus();

    setLoading(true);
    // Build conversation history for API
    const allMessages = [...messages, userMsg];
    const chatHistory = allMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Something went wrong. Check your API key in Settings.", timestamp: new Date() },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          timestamp: new Date(),
          ...(data.studyMaterials ? { studyMaterials: data.studyMaterials } : {}),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again.", timestamp: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
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
      <div className="shrink-0 px-6 pt-6 pb-4 border-b" style={{ borderColor: "#1e1a17" }}>
        <h1 className="text-2xl font-bold text-white">AI SMC Chat</h1>
        <p className="text-sm mt-1" style={{ color: "#888" }}>
          Ask questions about SMC concepts, get help with trade analysis
        </p>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "#1a1210", border: "2px solid #e8651a" }}
            >
              <svg
                className="w-8 h-8"
                style={{ color: "#e8651a" }}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              Welcome to AI SMC Chat
            </h2>
            <p className="text-sm mb-6" style={{ color: "#888" }}>
              Ask anything about SMC methodology. Try one of these:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-sm px-4 py-3 rounded-lg transition-colors cursor-pointer"
                  style={{
                    backgroundColor: "#141414",
                    border: "1px solid #2a2a2a",
                    color: "#ccc",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#e8651a";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#2a2a2a";
                    e.currentTarget.style.color = "#ccc";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* API Key Instructions — only show if no key */}
            {hasApiKey === false && (
              <div
                className="rounded-lg p-4 mt-4 w-full max-w-lg"
                style={{
                  background: "#111",
                  borderLeft: "3px solid #e8651a",
                }}
              >
                <p className="text-[#e8651a] font-semibold text-sm mb-2">You need a Claude API key to use AI Chat.</p>
                <ol className="text-[#a0a0a0] text-xs leading-relaxed list-decimal list-inside space-y-1">
                  <li>Go to <span className="text-[#d0d0d0]">Settings</span> in the sidebar</li>
                  <li>Get a free API key from <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-[#e8651a] hover:text-[#ff7e33] underline">console.anthropic.com</a></li>
                  <li>Paste it in Settings and hit Save</li>
                </ol>
              </div>
            )}
          </div>
        ) : (
          /* Message list */
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`${msg.role === "user" ? "max-w-[70%]" : "max-w-[80%]"} px-5 py-4 rounded-xl`}
                style={{
                  backgroundColor: msg.role === "user" ? "#1a1210" : "#111",
                  borderLeft:
                    msg.role === "user"
                      ? "3px solid #e8651a"
                      : "3px solid #22c55e",
                }}
              >
                {msg.role === "assistant" ? (
                  <div className="text-sm leading-relaxed space-y-3" style={{ color: "#d0d0d0" }}>
                    {msg.content.split("\n\n").map((block, bi) => {
                      const lines = block.split("\n").filter(Boolean);

                      // Heading: # ## ###
                      if (/^#{1,3}\s/.test(block)) {
                        const text = block.replace(/^#{1,3}\s*/, "");
                        return (
                          <div key={bi} className="flex items-center gap-2 mt-2 mb-1">
                            <div className="w-1 h-4 rounded-full" style={{ backgroundColor: "#e8651a" }} />
                            <span className="font-semibold text-white text-sm">{text.replace(/\*\*/g, "")}</span>
                          </div>
                        );
                      }
                      // Bold-only line as section header (e.g. **SMC Score: 85/100**)
                      if (/^\*\*[^*]+\*\*$/.test(block.trim())) {
                        const text = block.replace(/\*\*/g, "").trim();
                        // Score lines get special treatment
                        if (/score|rating/i.test(text)) {
                          return (
                            <div key={bi} className="flex items-center gap-2 px-3 py-2 rounded-lg mt-1" style={{ backgroundColor: "#1a1210", border: "1px solid #e8651a40" }}>
                              <span style={{ color: "#e8651a", fontSize: "16px" }}>◆</span>
                              <span className="font-bold text-white">{text}</span>
                            </div>
                          );
                        }
                        return (
                          <div key={bi} className="flex items-center gap-2 mt-2 mb-1">
                            <div className="w-1 h-4 rounded-full" style={{ backgroundColor: "#e8651a" }} />
                            <span className="font-semibold text-white">{text}</span>
                          </div>
                        );
                      }
                      // Bullet lists
                      if (lines.some(l => /^[-•]\s/.test(l))) {
                        return (
                          <ul key={bi} className="space-y-1.5 ml-2">
                            {lines.map((item, ii) => {
                              if (/^[-•]\s/.test(item)) {
                                const text = item.replace(/^[-•]\s*/, "");
                                return (
                                  <li key={ii} className="flex gap-2.5 items-start">
                                    <span className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#e8651a" }} />
                                    <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} />
                                  </li>
                                );
                              }
                              // Non-bullet line in a bullet block = sub-header
                              return <li key={ii} className="font-medium text-white -mb-0.5">{item.replace(/\*\*/g, "")}</li>;
                            })}
                          </ul>
                        );
                      }
                      // Numbered lists
                      if (lines.some(l => /^\d+[.)]\s/.test(l))) {
                        return (
                          <ol key={bi} className="space-y-1.5 ml-2">
                            {lines.map((item, ii) => {
                              if (/^\d+[.)]\s/.test(item)) {
                                const num = item.match(/^(\d+)/)?.[1] || String(ii + 1);
                                const text = item.replace(/^\d+[.)]\s*/, "");
                                return (
                                  <li key={ii} className="flex gap-2.5 items-start">
                                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#e8651a20", color: "#e8651a" }}>{num}</span>
                                    <span dangerouslySetInnerHTML={{ __html: text.replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} />
                                  </li>
                                );
                              }
                              return <li key={ii} className="font-medium text-white">{item.replace(/\*\*/g, "")}</li>;
                            })}
                          </ol>
                        );
                      }
                      // Regular paragraph
                      return <p key={bi} dangerouslySetInnerHTML={{ __html: block.replace(/\*\*(.*?)\*\*/g, '<span class="text-white font-medium">$1</span>') }} />;
                    })}
                  </div>
                ) : (
                  <p
                    className="text-sm whitespace-pre-wrap"
                    style={{ color: "#e0e0e0" }}
                  >
                    {msg.content}
                  </p>
                )}
                {msg.role === "assistant" && msg.studyMaterials && (
                  <StudyMaterialsSection data={msg.studyMaterials} />
                )}
                <p
                  className="text-xs mt-2"
                  style={{ color: "#555" }}
                >
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div
              className="max-w-[75%] px-4 py-3 rounded-lg"
              style={{ backgroundColor: "#141414", borderLeft: "2px solid #22c55e" }}
            >
              <p className="text-sm animate-pulse" style={{ color: "#888" }}>
                Thinking...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div
        className="shrink-0 px-6 py-4 border-t"
        style={{ borderColor: "#1e1a17", backgroundColor: "#0a0a0a" }}
      >
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about SMC concepts..."
            className="flex-1 text-sm px-4 py-3 rounded-lg outline-none transition-colors"
            style={{
              backgroundColor: "#141414",
              border: "1px solid #2a2a2a",
              color: "#e0e0e0",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "#e8651a";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "#2a2a2a";
            }}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 px-5 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: input.trim() ? "#e8651a" : "#9e4a15",
              color: "#fff",
            }}
            onMouseEnter={(e) => {
              if (input.trim()) e.currentTarget.style.backgroundColor = "#ff7e33";
            }}
            onMouseLeave={(e) => {
              if (input.trim()) e.currentTarget.style.backgroundColor = "#e8651a";
            }}
          >
            Send
          </button>

          {/* Clear button */}
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              className="shrink-0 text-xs px-3 py-3 rounded-lg transition-colors cursor-pointer"
              style={{
                backgroundColor: "transparent",
                border: "1px solid #2a2a2a",
                color: "#666",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#555";
                e.currentTarget.style.color = "#aaa";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2a2a2a";
                e.currentTarget.style.color = "#666";
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="shrink-0 text-center py-3 border-t"
        style={{ borderColor: "#1e1a17" }}
      >
        <p className="tracking-widest" style={{ color: "#444", fontSize: "9px" }}>
          POWERED BY SMC METHODOLOGY &middot; TRAINED ON 675+ SMC YOUTUBE TRANSCRIPTS
        </p>
      </div>
    </div>
  );
}
