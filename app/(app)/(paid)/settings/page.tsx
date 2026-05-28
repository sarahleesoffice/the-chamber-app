"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ApiKeyStatus {
  anthropic: boolean;
  gemini: boolean;
}

export default function SettingsPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus>({
    anthropic: false,
    gemini: false,
  });

  const [claudeKey, setClaudeKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  // Fetch user + existing keys on mount
  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setDisplayName(
        user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          "Trader"
      );

      const { data: keys } = await supabase
        .from("user_api_keys")
        .select("provider")
        .eq("user_id", user.id);

      if (keys) {
        setKeyStatus({
          anthropic: keys.some((k) => k.provider === "anthropic"),
          gemini: keys.some((k) => k.provider === "gemini"),
        });
      }
    }
    load();
  }, []);

  function showMessage(type: "success" | "error" | "warning", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function saveKey(provider: "anthropic" | "gemini", key: string) {
    if (!key.trim()) {
      showMessage("warning", "Please enter a valid API key.");
      return;
    }

    setSaving(provider);

    // Upsert: insert or update
    const { error } = await supabase.from("user_api_keys").upsert(
      {
        user_id: userId,
        provider,
        encrypted_key: key.trim(),
      },
      { onConflict: "user_id,provider" }
    );

    setSaving(null);

    if (error) {
      showMessage("error", `Failed to save key: ${error.message}`);
      return;
    }

    setKeyStatus((prev) => ({ ...prev, [provider]: true }));
    if (provider === "anthropic") setClaudeKey("");
    else setGeminiKey("");
    showMessage(
      "success",
      `${provider === "anthropic" ? "Claude" : "Gemini"} API key saved!`
    );
  }

  async function removeKey(provider: "anthropic" | "gemini") {
    setSaving(provider);

    const { error } = await supabase
      .from("user_api_keys")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);

    setSaving(null);

    if (error) {
      showMessage("error", `Failed to remove key: ${error.message}`);
      return;
    }

    setKeyStatus((prev) => ({ ...prev, [provider]: false }));
    showMessage(
      "success",
      `${provider === "anthropic" ? "Claude" : "Gemini"} API key removed.`
    );
  }

  const initial = displayName ? displayName[0].toUpperCase() : "?";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-1">
        <h1 className="text-[1.6rem] font-bold tracking-wide text-chamber-text">
          Settings
        </h1>
      </div>
      <p className="text-chamber-text-dim text-[0.78rem] mb-6">
        Manage your API keys and account settings
      </p>

      {/* Toast message */}
      {message && (
        <div
          className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-chamber-green/10 text-chamber-green border border-chamber-green/20"
              : message.type === "error"
                ? "bg-chamber-red/10 text-chamber-red border border-chamber-red/20"
                : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Account Card ─────────────────────────────────── */}
      <div className="bg-chamber-surface border border-chamber-border rounded-[10px] px-6 py-5 mb-7">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-chamber-orange flex items-center justify-center text-[1.2rem] font-extrabold text-chamber-bg shrink-0">
            {initial}
          </div>
          <div>
            <div className="text-chamber-text text-[1.05rem] font-bold">
              {displayName}
            </div>
            <div className="text-chamber-text-dim text-[0.75rem]">
              User ID: {userId ? `${userId.slice(0, 8)}...` : "---"}
            </div>
          </div>
        </div>
      </div>

      {/* ── AI API Keys Section ──────────────────────────── */}
      <div className="mb-1.5">
        <h2 className="text-chamber-text text-[1.1rem] font-bold">
          AI API Keys
        </h2>
      </div>
      <p className="text-[#666] text-[0.8rem] mb-5">
        To use AI Analysis and AI SMC Chat, you need your own API key. Your key
        is stored securely and only used for your requests.
      </p>

      {/* ── Claude Card ──────────────────────────────────── */}
      <ApiKeyCard
        name="Claude"
        subtitle="Anthropic"
        linkHref="https://console.anthropic.com/settings/keys"
        linkText="console.anthropic.com/settings/keys"
        connected={keyStatus.anthropic}
        placeholder="sk-ant-..."
        value={claudeKey}
        onChange={setClaudeKey}
        onSave={() => saveKey("anthropic", claudeKey)}
        onRemove={() => removeKey("anthropic")}
        saving={saving === "anthropic"}
      />

      <div className="h-5" />

      {/* ── Gemini Card ──────────────────────────────────── */}
      <ApiKeyCard
        name="Gemini"
        subtitle="Google AI"
        linkHref="https://aistudio.google.com/apikey"
        linkText="aistudio.google.com/apikey"
        connected={keyStatus.gemini}
        placeholder="AIza..."
        value={geminiKey}
        onChange={setGeminiKey}
        onSave={() => saveKey("gemini", geminiKey)}
        onRemove={() => removeKey("gemini")}
        saving={saving === "gemini"}
      />

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="text-center mt-10">
        <span className="text-[#333] text-[0.65rem] tracking-wide">
          YOUR API KEYS ARE STORED LOCALLY &middot; NEVER SHARED
        </span>
      </div>
    </div>
  );
}

/* ================================================================
   API Key Card Component
   ================================================================ */

interface ApiKeyCardProps {
  name: string;
  subtitle: string;
  linkHref: string;
  linkText: string;
  connected: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
  saving: boolean;
}

function ApiKeyCard({
  name,
  subtitle,
  linkHref,
  linkText,
  connected,
  placeholder,
  value,
  onChange,
  onSave,
  onRemove,
  saving,
}: ApiKeyCardProps) {
  return (
    <div className="bg-chamber-surface border border-chamber-border rounded-[10px] px-6 py-5">
      {/* Header row */}
      <div className="flex justify-between items-center mb-3.5">
        <div>
          <div className="text-chamber-text text-[0.95rem] font-bold">
            {name}
            <span className="text-chamber-text-muted font-normal text-[0.82rem] ml-1.5">
              {subtitle}
            </span>
          </div>
          <div className="text-chamber-text-dim text-[0.72rem] mt-0.5">
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-chamber-orange hover:text-chamber-orange-hover transition-colors no-underline"
            >
              {linkText}
            </a>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-[7px] h-[7px] rounded-full inline-block ${
              connected ? "bg-chamber-green" : "bg-chamber-red"
            }`}
          />
          <span
            className={`text-[0.75rem] font-semibold ${
              connected ? "text-chamber-green" : "text-chamber-red"
            }`}
          >
            {connected ? "Connected" : "No key"}
          </span>
        </div>
      </div>

      {/* Input */}
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-chamber-bg border border-chamber-border-light rounded-lg px-3 py-2 text-sm text-chamber-text placeholder:text-chamber-text-dim/60 focus:outline-none focus:border-chamber-orange/50 transition-colors mb-3"
      />

      {/* Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-chamber-orange hover:bg-chamber-orange-hover text-chamber-bg text-[0.85rem] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Saving..." : `Save ${name} Key`}
        </button>
        <button
          onClick={onRemove}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-transparent border border-[#333] text-chamber-text-muted text-[0.78rem] hover:border-chamber-red hover:text-chamber-red transition-colors disabled:opacity-50 cursor-pointer"
        >
          Remove Key
        </button>
      </div>
    </div>
  );
}
