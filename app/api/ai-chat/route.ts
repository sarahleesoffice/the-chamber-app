import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ICT_SYSTEM_PROMPT = `You are an expert ICT (Inner Circle Trader) methodology trading mentor inside "The Chamber" trading app.

Your knowledge covers all ICT concepts including:
- Market Structure (BOS, CHoCH, swing highs/lows)
- Order Blocks (bullish/bearish, mitigation, refinement)
- Fair Value Gaps (FVG, IFVG, BISI/SIBI)
- Liquidity (buy-side/sell-side, equal highs/lows, liquidity pools)
- Optimal Trade Entry (OTE, 62-79% fib retracement)
- Kill Zones (London, New York AM/PM, Asian)
- ICT Macros (9:50-10:10, 10:50-11:10, etc.)
- Power of 3 (Accumulation, Manipulation, Distribution)
- Silver Bullet (10:00-11:00 AM, 2:00-3:00 PM entries)
- Displacement and institutional candles
- Premium/Discount zones
- Judas Swing
- Smart Money Concepts

You are based on Jared Tendler's "The Mental Game of Trading" for psychology.

Rules:
- Be concise but thorough
- Use ICT terminology correctly
- Reference specific ICT concepts when relevant
- If asked about non-ICT topics, politely redirect to trading
- Never give specific financial advice or trade recommendations
- Always remind users to do their own analysis
- Keep responses under 300 words unless the topic requires more detail`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { messages } = await req.json();

    // RAG: Search knowledge base for relevant ICT transcript chunks
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    let ragContext = "";

    if (lastUserMessage) {
      // Try full-text search first
      const { data: chunks } = await supabase.rpc("search_knowledge_text", {
        search_query: lastUserMessage.content,
        match_count: 5,
      });

      if (chunks && chunks.length > 0) {
        ragContext = "\n\n---\nRELEVANT ICT TRANSCRIPT EXCERPTS (from 675+ ICT YouTube lectures):\n\n" +
          chunks.map((c: { content: string; source_video: string }, i: number) =>
            `[Source ${i + 1}: ${c.source_video || "ICT Lecture"}]\n${c.content}`
          ).join("\n\n") +
          "\n---\nUse these transcript excerpts to inform your answer. Cite the source when referencing specific content. If the excerpts don't cover the topic, use your general ICT knowledge.";
      } else {
        // Fallback: ILIKE search
        const { data: fallback } = await supabase
          .from("knowledge_chunks")
          .select("content, source_video")
          .ilike("content", `%${lastUserMessage.content.split(" ").slice(0, 3).join("%")}%`)
          .limit(3);

        if (fallback && fallback.length > 0) {
          ragContext = "\n\n---\nRELEVANT ICT TRANSCRIPT EXCERPTS:\n\n" +
            fallback.map((c: { content: string; source_video: string }, i: number) =>
              `[Source ${i + 1}: ${c.source_video || "ICT Lecture"}]\n${c.content}`
            ).join("\n\n") +
            "\n---\nUse these excerpts to inform your answer.";
        }
      }
    }

    // RAG: Search Gamma study cards by title AND content
    let gammaContext = "";
    if (lastUserMessage) {
      const queryWords = lastUserMessage.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      if (queryWords.length > 0) {
        // Search by title (most specific) and tags
        const titleFilters = queryWords.slice(0, 4).map((w: string) => `title.ilike.%${w}%`).join(",");
        const { data: gammaCards } = await supabase
          .from("gamma_cards")
          .select("title, content, deck_name, gamma_url, category")
          .or(titleFilters)
          .limit(5);

        if (gammaCards && gammaCards.length > 0) {
          gammaContext = "\n\n---\nSTUDY CARDS FROM THE CHAMBER (your study materials):\n\n" +
            gammaCards.map((g: { title: string; content: string; deck_name: string; gamma_url: string; category: string }, i: number) =>
              `📘 ${g.title} (${g.category || g.deck_name})${g.gamma_url ? ` — Gamma deck: ${g.gamma_url}` : ""}`
            ).join("\n") +
            "\n---\nIMPORTANT: Always mention these study cards when they match the topic. Say something like 'You can review this in your study cards: [card title] from [category]'. If a Gamma deck link exists, include it.";
        }
      }
    }

    // RAG: Search Discord thread references — broader matching
    let discordContext = "";
    if (lastUserMessage) {
      const queryWords = lastUserMessage.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
      if (queryWords.length > 0) {
        // Search concept names and descriptions
        const conceptFilters = queryWords.slice(0, 4).map((w: string) => `concept.ilike.%${w}%`).join(",");
        const { data: discordRefs } = await supabase
          .from("discord_references")
          .select("concept, thread_title, thread_url, channel_name, description")
          .or(conceptFilters)
          .limit(3);

        if (discordRefs && discordRefs.length > 0) {
          discordContext = "\n\n---\nDISCORD STUDY THREADS (from The Chamber Discord):\n\n" +
            discordRefs.map((d: { concept: string; thread_title: string; thread_url: string; channel_name: string; description: string }) =>
              `💬 ${d.concept}: ${d.thread_url}`
            ).join("\n") +
            "\n---\nIMPORTANT: Always include the Discord link at the end of your response when a matching thread exists. Format it as: '📚 Study more in our Discord: [link]'";
        }
      }
    }

    const systemPromptWithRAG = ICT_SYSTEM_PROMPT + ragContext + gammaContext + discordContext;

    // Get user's API key
    const { data: keys } = await supabase
      .from("user_api_keys")
      .select("provider, encrypted_key")
      .eq("user_id", user.id);

    if (!keys || keys.length === 0) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    // Prefer anthropic, fallback to gemini
    const anthropicKey = keys.find((k) => k.provider === "anthropic");
    const geminiKey = keys.find((k) => k.provider === "gemini");

    if (anthropicKey) {
      // Call Claude API
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey.encrypted_key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPromptWithRAG,
          messages: messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return NextResponse.json(
          { error: err?.error?.message || "Claude API error" },
          { status: response.status }
        );
      }

      const data = await response.json();
      const reply = data.content?.[0]?.text || "No response from Claude.";
      return NextResponse.json({ reply, provider: "claude" });

    } else if (geminiKey) {
      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey.encrypted_key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPromptWithRAG }] },
            contents: messages.map((m: { role: string; content: string }) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return NextResponse.json(
          { error: err?.error?.message || "Gemini API error" },
          { status: response.status }
        );
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";
      return NextResponse.json({ reply, provider: "gemini" });

    } else {
      return NextResponse.json({ error: "No supported API key found" }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
