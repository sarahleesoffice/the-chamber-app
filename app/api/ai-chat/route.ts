import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ICT_SYSTEM_PROMPT = `You are the AI mentor inside "The Chamber" — a trading app built on ICT (Inner Circle Trader) methodology, powered by 675+ ICT YouTube lecture transcripts, study cards, and Discord discussions.

RESPONSE FORMAT — You MUST follow this structure for EVERY response:

1. **Answer the question** using the provided transcript excerpts and study materials. Base your answer on the SOURCE MATERIAL provided, not general knowledge.

2. **📘 Study Cards** — If study cards are provided below, you MUST include a section at the end:
   📘 **Related Study Cards:**
   - [Card Title] — [Category]
   If a Gamma deck URL is provided, add: [View Study Deck](url)

3. **🎥 ICT Sources** — If transcript excerpts are provided, you MUST cite them:
   🎥 **From ICT Lectures:**
   - "[Video Title]" — [brief what was covered]

4. **💬 Discord** — If Discord thread links are provided, you MUST include at the very end:
   💬 **Study this topic in our Discord:** [full URL]

Rules:
- ALWAYS use the provided source materials to answer. Do NOT rely on general knowledge when sources are available.
- ALWAYS include the study cards, video sources, and Discord sections when the data is provided to you.
- Be concise but thorough. Use ICT terminology.
- Never give specific financial advice or trade recommendations.
- Psychology questions use Jared Tendler's "The Mental Game of Trading" framework.`;

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
        match_count: 2,
      });

      if (chunks && chunks.length > 0) {
        ragContext = "\n\nSOURCES:\n" +
          chunks.map((c: { content: string; source_video: string }) =>
            `[${c.source_video || "ICT"}]: ${c.content.slice(0, 300)}`
          ).join("\n");
      }
    }

    // RAG: Search Gamma cards + Discord
    let studyContext = "";
    let studyMaterials: { cards: Array<{ title: string; category: string; gamma_url: string; content: string }>; discord: Array<{ concept: string; thread_url: string }>; sources: Array<{ video: string }> } = { cards: [], discord: [], sources: [] };

    if (lastUserMessage) {
      // Filter out stop words and generic terms to get meaningful search words
      const STOP_WORDS = new Set(["what", "how", "does", "the", "are", "is", "can", "you", "explain", "tell", "about", "ict", "trading", "trade", "market", "price", "use", "work", "mean", "definition", "define", "describe", "give", "show", "find", "help", "please", "would", "could", "should", "will", "this", "that", "with", "from", "have", "been", "being", "they", "them", "their", "which", "when", "where", "why", "who", "whom"]);
      const words = lastUserMessage.content.toLowerCase()
        .replace(/[?!.,;:'"]/g, "")
        .split(/\s+/)
        .filter((w: string) => w.length > 2 && !STOP_WORDS.has(w))
        .slice(0, 4);

      if (words.length > 0) {
        // Build smarter filters — require longer/more specific words
        const filters = words.map((w: string) => `title.ilike.%${w}%`).join(",");
        const { data: cards } = await supabase.from("gamma_cards").select("title, category, gamma_url, content").or(filters).limit(5);

        // Score and rank cards — heavily favor exact concept matches over partials
        const queryPhrase = words.join(" ");
        const scoredCards = (cards || []).map((card: { title: string; category: string; gamma_url: string; content: string }) => {
          const titleLower = card.title.toLowerCase().replace(/-/g, " ");
          let score = 0;

          // Exact match or near-exact (e.g. "Order Blocks" matches "Order Blocks") — highest priority
          if (titleLower === queryPhrase || titleLower.replace(/s$/, "") === queryPhrase.replace(/s$/, "")) score += 100;
          // Title starts with the query phrase
          else if (titleLower.startsWith(queryPhrase)) score += 50;
          // Query phrase appears in title
          else if (titleLower.includes(queryPhrase)) score += 30;

          // Individual word matches — shorter titles with more matches rank higher
          const wordScore = words.reduce((s: number, w: string) => s + (titleLower.includes(w) ? (w.length > 4 ? 3 : 1) : 0), 0);
          score += wordScore;

          // Penalize very long titles (these are usually video titles, not concept slides)
          if (card.title.length > 40) score -= 5;
          // Bonus for short, concept-like titles (e.g. "Order Blocks", "Fair Value Gaps")
          if (card.title.length < 25) score += 10;

          return { ...card, score };
        }).filter((c: { score: number }) => c.score > 0)
          .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
          .slice(0, 3);

        const rankedCards = scoredCards.length > 0 ? scoredCards : (cards || []).slice(0, 3);
        // Discord: search concept AND description, also match study card categories
        const matchedCategories = rankedCards.map((c: { category: string }) => c.category).filter(Boolean) || [];
        let discord: Array<{ concept: string; thread_url: string }> | null = null;

        if (matchedCategories.length > 0) {
          // Match by category from found cards
          const catFilters = matchedCategories.map((c: string) => `concept.eq.${c}`).join(",");
          const { data } = await supabase.from("discord_references").select("concept, thread_url").or(catFilters).limit(2);
          discord = data;
        }
        if (!discord?.length) {
          // Fallback: keyword search on concept + description
          const descFilters = words.map((w: string) => `concept.ilike.%${w}%,description.ilike.%${w}%`).join(",");
          const { data } = await supabase.from("discord_references").select("concept, thread_url").or(descFilters).limit(2);
          discord = data;
        }

        if (rankedCards.length) {
          studyMaterials.cards = rankedCards;
          studyContext += "\nSTUDY CARDS: " + rankedCards.map((g: { title: string; category: string }) => `${g.title} (${g.category})`).join("; ");
        }
        if (discord?.length) {
          studyMaterials.discord = discord;
          studyContext += "\nDISCORD: " + discord.map((d: { concept: string; thread_url: string }) => `${d.concept}`).join("; ");
        }
      }
    }

    // Extract source video names from RAG context
    if (ragContext) {
      const videoMatches = ragContext.match(/\[([^\]]+)\]:/g);
      if (videoMatches) {
        studyMaterials.sources = videoMatches.map(m => ({ video: m.replace(/[\[\]:]/g, "").trim() }));
      }
    }

    // If no sources found from RAG, search for matching videos directly
    if (studyMaterials.sources.length === 0 && lastUserMessage) {
      const searchWords = lastUserMessage.content.toLowerCase()
        .replace(/[?!.,;:'"]/g, "")
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !new Set(["what", "how", "does", "explain", "about"]).has(w))
        .slice(0, 2);

      if (searchWords.length > 0) {
        const videoFilter = searchWords.map((w: string) => `source_video.ilike.%${w}%`).join(",");
        const { data: videos } = await supabase
          .from("knowledge_chunks")
          .select("source_video")
          .or(videoFilter)
          .not("source_video", "is", null)
          .limit(20);

        if (videos?.length) {
          // Deduplicate and take top 3
          const unique = [...new Set(videos.map((v: { source_video: string }) => v.source_video).filter(Boolean))].slice(0, 3);
          studyMaterials.sources = unique.map(v => ({ video: v as string }));
        }
      }
    }

    const systemPromptWithRAG = ICT_SYSTEM_PROMPT + ragContext + studyContext;

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
      return NextResponse.json({ reply, provider: "claude", studyMaterials });

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
      return NextResponse.json({ reply, provider: "gemini", studyMaterials });

    } else {
      return NextResponse.json({ error: "No supported API key found" }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
