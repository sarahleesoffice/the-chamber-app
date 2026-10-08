"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_MODELS,
  PROVIDER_FALLBACK_ORDER,
  type AIProvider,
} from "@/lib/ai-providers";

type ApiKeyStatus = Record<AIProvider, boolean>;

const PROVIDER_NAME: Record<AIProvider, string> = {
  anthropic: "Claude",
  gemini: "Gemini",
  openai: "ChatGPT",
  openrouter: "OpenRouter",
};

export default function SettingsPage() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [keyStatus, setKeyStatus] = useState<ApiKeyStatus>({
    anthropic: false,
    gemini: false,
    openai: false,
    openrouter: false,
  });
  const [keyInputs, setKeyInputs] = useState<Record<AIProvider, string>>({
    anthropic: "",
    gemini: "",
    openai: "",
    openrouter: "",
  });
  // Which key AI features use; stored in user_metadata so API routes can read it
  const [preferred, setPreferred] = useState<AIProvider | null>(null);
  const [openrouterModel, setOpenrouterModel] = useState<string>(DEFAULT_OPENROUTER_MODEL);
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
          openai: keys.some((k) => k.provider === "openai"),
          openrouter: keys.some((k) => k.provider === "openrouter"),
        });
      }
      const meta = user.user_metadata || {};
      if (PROVIDER_FALLBACK_ORDER.includes(meta.ai_provider)) setPreferred(meta.ai_provider);
      if (OPENROUTER_MODELS.some((m) => m.id === meta.openrouter_model)) setOpenrouterModel(meta.openrouter_model);
    }
    load();
  }, []);

  function showMessage(type: "success" | "error" | "warning", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  // Mirrors pickKey() on the server: the chosen provider if it has a key, else the first saved key
  const activeProvider =
    preferred && keyStatus[preferred]
      ? preferred
      : PROVIDER_FALLBACK_ORDER.find((p) => keyStatus[p]) ?? null;
  // The switch shows the user's pick, even before that key is saved
  const selectedProvider = preferred ?? activeProvider;

  async function savePreference(data: { ai_provider?: AIProvider | null; openrouter_model?: string }) {
    const { error } = await supabase.auth.updateUser({ data });
    if (error) {
      showMessage("error", `Failed to save: ${error.message}`);
      return false;
    }
    return true;
  }

  async function toggleProvider(provider: AIProvider) {
    // Switching the selected one off goes back to automatic (first saved key)
    const next = selectedProvider === provider ? null : provider;
    if (await savePreference({ ai_provider: next })) {
      setPreferred(next);
      showMessage(
        "success",
        next
          ? keyStatus[next]
            ? `AI features will now use ${PROVIDER_NAME[next]}.`
            : `${PROVIDER_NAME[next]} selected. Save a key to start using it.`
          : "Automatic: AI features use your first saved key."
      );
    }
  }

  async function changeOpenrouterModel(model: string) {
    const previous = openrouterModel;
    setOpenrouterModel(model);
    if (await savePreference({ openrouter_model: model })) {
      showMessage("success", "OpenRouter model saved.");
    } else {
      setOpenrouterModel(previous);
    }
  }

  async function saveKey(provider: AIProvider, key: string) {
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
    setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
    showMessage("success", `${PROVIDER_NAME[provider]} API key saved!`);
  }

  async function removeKey(provider: AIProvider) {
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
    showMessage("success", `${PROVIDER_NAME[provider]} API key removed.`);
  }

  const cardProps = (provider: AIProvider) => ({
    connected: keyStatus[provider],
    active: activeProvider === provider,
    selected: selectedProvider === provider,
    value: keyInputs[provider],
    onChange: (v: string) => setKeyInputs((prev) => ({ ...prev, [provider]: v })),
    onSave: () => saveKey(provider, keyInputs[provider]),
    onRemove: () => removeKey(provider),
    onToggle: () => toggleProvider(provider),
    saving: saving === provider,
  });

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
        is only used for your own requests. If you add more than one, pick
        which one to use.
      </p>

      <div className="space-y-5">
        <ApiKeyCard
          name="Claude"
          subtitle="Anthropic"
          linkHref="https://console.anthropic.com/settings/keys"
          linkText="console.anthropic.com/settings/keys"
          placeholder="sk-ant-..."
          {...cardProps("anthropic")}
        />
        <ApiKeyCard
          name="ChatGPT"
          subtitle="OpenAI"
          linkHref="https://platform.openai.com/api-keys"
          linkText="platform.openai.com/api-keys"
          placeholder="sk-..."
          note="A ChatGPT Plus subscription doesn't include API access. Create a key and add billing at platform.openai.com."
          {...cardProps("openai")}
        />
        <ApiKeyCard
          name="Gemini"
          subtitle="Google AI"
          linkHref="https://aistudio.google.com/apikey"
          linkText="aistudio.google.com/apikey"
          placeholder="AIza..."
          {...cardProps("gemini")}
        />
        <ApiKeyCard
          name="OpenRouter"
          subtitle="Any model, one key"
          linkHref="https://openrouter.ai/keys"
          linkText="openrouter.ai/keys"
          placeholder="sk-or-..."
          note="One key for Claude, GPT, Gemini and Grok. Buy credits on openrouter.ai, then choose a model below."
          extra={
            <label className="block mb-3">
              <span className="block text-chamber-text-muted text-[0.72rem] mb-1">Model</span>
              <div className="relative">
                {/* Custom chevron: the native arrow sits flush against the border */}
                <select
                  value={openrouterModel}
                  onChange={(e) => changeOpenrouterModel(e.target.value)}
                  className="w-full appearance-none bg-chamber-bg border border-chamber-border-light rounded-lg pl-3 pr-10 py-2 text-sm text-chamber-text focus:outline-none focus:border-chamber-orange/50 transition-colors cursor-pointer"
                >
                  {OPENROUTER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-chamber-text-muted"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </label>
          }
          {...cardProps("openrouter")}
        />
      </div>

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="text-center mt-10">
        <span className="text-[#333] text-[0.65rem] tracking-wide">
          YOUR API KEYS ARE ONLY USED FOR YOUR OWN REQUESTS &middot; NEVER SHARED
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
  active: boolean;
  selected: boolean;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onToggle: () => void;
  saving: boolean;
  note?: string;
  extra?: ReactNode;
}

function ApiKeyCard({
  name,
  subtitle,
  linkHref,
  linkText,
  connected,
  active,
  selected,
  placeholder,
  value,
  onChange,
  onSave,
  onRemove,
  onToggle,
  saving,
  note,
  extra,
}: ApiKeyCardProps) {
  return (
    <div
      className={`bg-chamber-surface border rounded-[10px] px-6 py-5 transition-colors ${
        selected ? "border-chamber-orange/60" : "border-chamber-border"
      }`}
    >
      {/* Header row */}
      <div className="flex justify-between items-center gap-3 mb-3.5">
        <div className="min-w-0">
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
        <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
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

      {note && <p className="text-chamber-text-dim text-[0.72rem] -mt-1.5 mb-3">{note}</p>}

      {extra}

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

      {/* Which key AI features use — one small switch per card, at most one on */}
      <div className="flex items-center justify-end gap-2 mt-3">
        {selected && (
          <span className="text-[0.68rem] text-chamber-text-dim mr-auto">
            {active ? "In use for AI Analysis & SMC Chat" : "Save a key to start using it"}
          </span>
        )}
        <span className={`text-[0.72rem] ${selected ? "text-chamber-orange font-semibold" : "text-chamber-text-muted"}`}>
          Use this one
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={selected}
          aria-label={`Use ${name} for AI features`}
          onClick={onToggle}
          className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
            selected
              ? "bg-chamber-orange border-chamber-orange"
              : "bg-chamber-bg border-chamber-border-light hover:border-chamber-orange/50"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
              selected ? "translate-x-[16px]" : "translate-x-[2px]"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
