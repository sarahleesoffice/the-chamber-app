"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  "What is an Order Block?",
  "Explain the Silver Bullet setup",
  "How does Power of 3 work?",
  "What are ICT Macros?",
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
        { role: "assistant", content: data.reply, timestamp: new Date() },
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
        <h1 className="text-2xl font-bold text-white">AI ICT Chat</h1>
        <p className="text-sm mt-1" style={{ color: "#888" }}>
          Ask questions about ICT concepts, get help with trade analysis
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
              Welcome to AI ICT Chat
            </h2>
            <p className="text-sm mb-6" style={{ color: "#888" }}>
              Ask anything about ICT methodology. Try one of these:
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
                      // Bold-only line as section header (e.g. **ICT Score: 85/100**)
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
            placeholder="Ask about ICT concepts..."
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
          POWERED BY ICT METHODOLOGY &middot; TRAINED ON 675+ ICT YOUTUBE TRANSCRIPTS
        </p>
      </div>
    </div>
  );
}
