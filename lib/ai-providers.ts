/**
 * One code path for every bring-your-own-key AI provider (server-side only).
 * AI Analysis, AI SMC Chat and chart detection all call generate(); which
 * provider runs is the user's choice in Settings (stored in user_metadata).
 *
 * Model IDs drift as providers retire models, so direct providers try a list
 * newest-first and fall back on model-not-found errors.
 */

export type AIProvider = "anthropic" | "gemini" | "openai" | "openrouter";

/** Order used when the user hasn't picked one (keeps the original Claude-first behaviour). */
export const PROVIDER_FALLBACK_ORDER: AIProvider[] = ["anthropic", "gemini", "openai", "openrouter"];

export const OPENROUTER_MODELS = [
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5 (recommended)" },
  { id: "openai/gpt-6-sol", label: "GPT-6 Sol" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna (cheapest)" },
  { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "x-ai/grok-4.7", label: "Grok 4.7" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5 (fast)" },
] as const;

export const DEFAULT_OPENROUTER_MODEL = OPENROUTER_MODELS[0].id;

const ANTHROPIC_MODELS = [
  "claude-sonnet-5-5",
  "claude-sonnet-4-5-20250929",
  "claude-3-5-sonnet-20241022",
  "claude-3-haiku-20240307",
];
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
const OPENAI_MODELS = ["gpt-6-sol", "gpt-5.6-sol", "gpt-5.4-mini"];

/** Label stored on saved analyses and returned to the UI. */
const PROVIDER_LABEL: Record<AIProvider, string> = {
  anthropic: "claude",
  gemini: "gemini",
  openai: "chatgpt",
  openrouter: "openrouter",
};

export interface ChatImage {
  base64: string;
  mediaType: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  images?: ChatImage[];
}

export interface GenerateOptions {
  provider: AIProvider;
  apiKey: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  /** OpenRouter only: the model the user picked */
  model?: string | null;
  /**
   * How hard newer Claude models think before answering. Lower starts the reply
   * sooner (and costs less); omitted = the model's default ("high" on Sonnet 5.5).
   */
  effort?: "low" | "medium" | "high";
}

export interface GenerateResult {
  text: string;
  provider: string; // PROVIDER_LABEL value
  model: string;
}

/** Carries the upstream HTTP status so routes can pass it through. */
export class AIProviderError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * The key to use: the user's chosen provider if they have that key, else the
 * first one they have. `keys` are already-decrypted keys (lib/api-keys.ts).
 */
export function pickKey(
  keys: Partial<Record<AIProvider, string>>,
  preferred: unknown
): { provider: AIProvider; key: string } | null {
  const order = typeof preferred === "string" && PROVIDER_FALLBACK_ORDER.includes(preferred as AIProvider)
    ? [preferred as AIProvider, ...PROVIDER_FALLBACK_ORDER.filter((p) => p !== preferred)]
    : PROVIDER_FALLBACK_ORDER;
  for (const p of order) {
    const key = keys[p];
    if (key) return { provider: p, key };
  }
  return null;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const err = await res.json().catch(() => ({}));
  const detail = err?.error?.message || (typeof err?.error === "string" ? err.error : "") || fallback;
  // Providers word bad keys confusingly (OpenRouter: "Missing Authentication header")
  return res.status === 401 ? `Your API key was rejected. Check it in Settings. (${detail})` : detail;
}

/**
 * Try models newest-first. A 404/400 usually means "model not available to
 * this key", so move on; auth, billing and rate-limit errors stop immediately.
 */
async function tryModels(
  name: string,
  models: string[],
  call: (model: string) => Promise<Response>,
  read: (res: Response) => Promise<string>
): Promise<{ text: string; model: string }> {
  let lastError = "";
  for (const model of models) {
    const res = await call(model);
    if (res.ok) return { text: await read(res), model };
    lastError = await errorMessage(res, `${name} API error`);
    if (res.status !== 404 && res.status !== 400) {
      throw new AIProviderError(`${name} API: ${lastError}`, res.status);
    }
  }
  throw new AIProviderError(`${name} API: No compatible model found. Last error: ${lastError}`, 400);
}

/** Receives each piece of the reply as it streams in. */
export type OnText = (chunk: string) => void;

/** Calls onData with the payload of every `data:` line of a server-sent-events body. */
async function readSSE(res: Response, onData: (data: string) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) onData(line.slice(5).trim());
    }
  }
}

/** Anthropic streaming: forward text deltas, skip (hidden) thinking blocks. */
async function streamAnthropic(res: Response, onText: OnText): Promise<string> {
  let text = "";
  let textBlocks = 0;
  await readSSE(res, (data) => {
    const ev = JSON.parse(data);
    if (ev.type === "content_block_start" && ev.content_block?.type === "text") {
      // Separate consecutive text blocks the same way the non-streaming reader joins them
      if (textBlocks++ > 0 && text) {
        text += "\n\n";
        onText("\n\n");
      }
    } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
      text += ev.delta.text;
      onText(ev.delta.text);
    } else if (ev.type === "error") {
      throw new AIProviderError(`Claude API: ${ev.error?.message || "stream error"}`, 502);
    }
  });
  return text;
}

/** OpenAI / OpenRouter streaming (Chat Completions deltas). */
async function streamChatCompletion(res: Response, onText: OnText): Promise<string> {
  let text = "";
  await readSSE(res, (data) => {
    if (data === "[DONE]" || !data.startsWith("{")) return;
    const ev = JSON.parse(data);
    if (ev.error) throw new AIProviderError(ev.error.message || "stream error", 502);
    const piece: string | undefined = ev.choices?.[0]?.delta?.content;
    if (piece) {
      text += piece;
      onText(piece);
    }
  });
  return text;
}

function callAnthropic(o: GenerateOptions, onText?: OnText) {
  const messages = o.messages.map((m) => ({
    role: m.role,
    content: m.images?.length
      ? [
          ...m.images.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.base64 },
          })),
          { type: "text", text: m.text },
        ]
      : m.text,
  }));
  return tryModels(
    "Claude",
    ANTHROPIC_MODELS,
    (model) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": o.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          // Sonnet 5+ thinks by default and that thinking counts toward max_tokens, so give
          // it room; older models reject large values, so they keep the caller's limit.
          max_tokens: model.startsWith("claude-sonnet-5") ? Math.max(o.maxTokens, 16000) : o.maxTokens,
          system: o.system,
          messages,
          // Effort is only understood by Sonnet 5+; older fallback models would reject it
          ...(o.effort && model.startsWith("claude-sonnet-5") ? { output_config: { effort: o.effort } } : {}),
          ...(onText ? { stream: true } : {}),
        }),
      }),
    // Newer models put a (hidden) thinking block first, so join every text block
    // instead of reading content[0].
    onText
      ? (res) => streamAnthropic(res, onText)
      : async (res) =>
          (((await res.json()) as { content?: { type?: string; text?: string }[] }).content || [])
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text)
            .join("\n\n")
  );
}

function callGemini(o: GenerateOptions) {
  const contents = o.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [
      ...(m.images || []).map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.base64 } })),
      { text: m.text },
    ],
  }));
  return tryModels(
    "Gemini",
    GEMINI_MODELS,
    (model) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": o.apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: o.system }] }, contents }),
      }),
    async (res) =>
      ((await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content
        ?.parts?.[0]?.text || ""
  );
}

/** OpenAI and OpenRouter share the Chat Completions format. */
function openAIMessages(o: GenerateOptions) {
  return [
    { role: "system", content: o.system },
    ...o.messages.map((m) => ({
      role: m.role,
      content: m.images?.length
        ? [
            ...m.images.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
            })),
            { type: "text", text: m.text },
          ]
        : m.text,
    })),
  ];
}

const readChatCompletion = (data: unknown) =>
  (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content || "";

function callOpenAI(o: GenerateOptions, onText?: OnText) {
  const messages = openAIMessages(o);
  // No token cap: newer OpenAI models spend part of the budget on hidden
  // reasoning, and a tight cap can return an empty answer.
  return tryModels(
    "ChatGPT",
    OPENAI_MODELS,
    (model) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${o.apiKey}` },
        body: JSON.stringify({ model, messages, ...(onText ? { stream: true } : {}) }),
      }),
    onText ? (res) => streamChatCompletion(res, onText) : async (res) => readChatCompletion(await res.json())
  );
}

async function callOpenRouter(o: GenerateOptions, onText?: OnText) {
  const model = o.model && OPENROUTER_MODELS.some((m) => m.id === o.model) ? o.model : DEFAULT_OPENROUTER_MODEL;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${o.apiKey}`,
      "X-Title": "The Chamber",
    },
    body: JSON.stringify({ model, messages: openAIMessages(o), ...(onText ? { stream: true } : {}) }),
  });
  if (!res.ok) {
    throw new AIProviderError(`OpenRouter API: ${await errorMessage(res, "OpenRouter API error")}`, res.status);
  }
  const text = onText ? await streamChatCompletion(res, onText) : readChatCompletion(await res.json());
  return { text, model };
}

/**
 * Generate a reply. With onText, the reply streams in as it's written (Claude,
 * ChatGPT, OpenRouter); providers that don't stream here (Gemini) deliver the
 * whole reply as one chunk at the end.
 */
export async function generate(o: GenerateOptions, onText?: OnText): Promise<GenerateResult> {
  const run = { anthropic: callAnthropic, gemini: callGemini, openai: callOpenAI, openrouter: callOpenRouter }[o.provider];
  let streamed = false;
  const forward: OnText | undefined = onText
    ? (chunk) => {
        streamed = true;
        onText(chunk);
      }
    : undefined;
  const { text, model } = await run(o, forward);
  if (onText && !streamed && text) onText(text);
  return { text, model, provider: PROVIDER_LABEL[o.provider] };
}
