import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SMC_SYSTEM_PROMPT = `You are the AI mentor inside "The Chamber" — a trading app built on SMC (Smart Money Concepts) methodology, powered by 675+ SMC YouTube lecture transcripts, study cards, and Discord discussions.

RESPONSE FORMAT — You MUST follow this structure for EVERY response:

1. **Answer the question** using the provided transcript excerpts and study materials. Base your answer on the SOURCE MATERIAL provided, not general knowledge.

2. **📘 Study Cards** — If study cards are provided below, you MUST include a section at the end:
   📘 **Related Study Cards:**
   - [Card Title] — [Category]
   If a Gamma deck URL is provided, add: [View Study Deck](url)

3. **🎥 SMC Sources** — If transcript excerpts are provided, you MUST cite them:
   🎥 **From SMC Lectures:**
   - "[Video Title]" — [brief what was covered]

4. **💬 Discord** — If Discord thread links are provided, you MUST include at the very end:
   💬 **Study this topic in our Discord:** [full URL]

Rules:
- ALWAYS use the provided source materials to answer. Do NOT rely on general knowledge when sources are available.
- ALWAYS include the study cards, video sources, and Discord sections when the data is provided to you.
- Be concise but thorough. Use SMC terminology.
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

    // RAG: Search knowledge base for relevant SMC transcript chunks
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
            `[${c.source_video || "SMC"}]: ${c.content.slice(0, 300)}`
          ).join("\n");
      }
    }

    // RAG: Search Gamma cards + Discord
    let studyContext = "";
    let studyMaterials: { cards: Array<{ title: string; category: string; gamma_url: string; content: string }>; discord: Array<{ concept: string; thread_url: string }>; sources: Array<{ video: string; url: string }> } = { cards: [], discord: [], sources: [] };

    if (lastUserMessage) {
      const STOP_WORDS = new Set(["what", "how", "does", "the", "are", "is", "can", "you", "explain", "tell", "about", "smc", "trading", "trade", "market", "price", "use", "work", "mean", "definition", "define", "describe", "give", "show", "find", "help", "please", "would", "could", "should", "will", "this", "that", "with", "from", "have", "been", "being", "they", "them", "their", "which", "when", "where", "why", "who", "whom", "me", "do", "my", "for", "and", "any", "some"]);
      const words = lastUserMessage.content.toLowerCase()
        .replace(/[?!.,;:'"()]/g, "")
        .split(/\s+/)
        .filter((w: string) => w.length > 1 && !STOP_WORDS.has(w))
        .slice(0, 6);

      // Also extract multi-word phrases that match common SMC concepts
      const queryLower = lastUserMessage.content.toLowerCase();
      const SMC_CONCEPTS: Record<string, string[]> = {
        "order block": ["order", "block"],
        "fair value gap": ["fair", "value", "gap"],
        "fvg": ["fair", "value", "gap", "fvg"],
        "ote": ["optimal", "trade", "entry", "ote"],
        "optimal trade entry": ["optimal", "trade", "entry"],
        "breaker block": ["breaker", "block"],
        "mitigation block": ["mitigation", "block"],
        "rejection block": ["rejection", "block"],
        "propulsion block": ["propulsion", "block"],
        "vacuum block": ["vacuum", "block"],
        "reclaimed order block": ["reclaimed", "order", "block"],
        "judas swing": ["judas", "swing"],
        "kill zone": ["kill", "zone"],
        "silver bullet": ["silver", "bullet"],
        "macro": ["macro", "macros"],
        "liquidity": ["liquidity"],
        "liquidity void": ["liquidity", "void"],
        "liquidity pool": ["liquidity", "pool"],
        "market structure": ["market", "structure"],
        "market maker": ["market", "maker"],
        "turtle soup": ["turtle", "soup"],
        "power of 3": ["power"],
        "displacement": ["displacement"],
        "top down analysis": ["top", "down", "analysis"],
        "bias": ["bias", "higher", "timeframe"],
        "interest rate": ["interest", "rate"],
        "sentiment": ["sentiment"],
      };

      // Find which SMC concept(s) the user is asking about
      const matchedConcepts: string[] = [];
      for (const [concept, _keywords] of Object.entries(SMC_CONCEPTS)) {
        if (queryLower.includes(concept)) {
          matchedConcepts.push(concept);
        }
      }

      if (words.length > 0 || matchedConcepts.length > 0) {
        // Search by title AND tags for broader matching
        const titleFilters = words.map((w: string) => `title.ilike.%${w}%`).join(",");
        const { data: titleCards } = await supabase
          .from("gamma_cards")
          .select("title, category, gamma_url, content, tags")
          .or(titleFilters)
          .limit(15);

        // Also search by tags array — overlap with keywords
        const tagFilters = words.map((w: string) => `tags.cs.{${w}}`).join(",");
        const { data: tagCards } = await supabase
          .from("gamma_cards")
          .select("title, category, gamma_url, content, tags")
          .or(tagFilters)
          .limit(15);

        // Merge and deduplicate
        const allCards = new Map<string, { title: string; category: string; gamma_url: string; content: string; tags?: string[] }>();
        for (const card of [...(titleCards || []), ...(tagCards || [])]) {
          allCards.set(card.title, card);
        }

        // Score cards with concept-aware matching
        const queryPhrase = words.join(" ");
        const conceptWords = matchedConcepts.flatMap(c => SMC_CONCEPTS[c] || []);
        const allSearchTerms = [...new Set([...words, ...conceptWords])];

        const scoredCards = Array.from(allCards.values()).map((card) => {
          const titleLower = card.title.toLowerCase().replace(/-/g, " ");
          let score = 0;

          // Check if title matches a known SMC concept from the query
          for (const concept of matchedConcepts) {
            if (titleLower.includes(concept)) score += 80;
            // Also check if the concept keywords all appear in the title
            const cWords = SMC_CONCEPTS[concept] || [];
            const allPresent = cWords.every(w => titleLower.includes(w));
            if (allPresent && cWords.length >= 2) score += 60;
          }

          // Exact full phrase match
          if (titleLower === queryPhrase) score += 100;
          else if (titleLower.includes(queryPhrase) && queryPhrase.length > 4) score += 40;

          // Word-level matching — more matching words = higher score
          let matchCount = 0;
          for (const w of allSearchTerms) {
            if (titleLower.includes(w)) {
              matchCount++;
              score += w.length > 4 ? 4 : 2;
            }
          }
          // Bonus for multiple word matches (suggests strong relevance)
          if (matchCount >= 2) score += matchCount * 5;

          // Tag matching
          const cardTags = (card.tags || []).map((t: string) => t.toLowerCase());
          for (const w of allSearchTerms) {
            if (cardTags.includes(w)) score += 3;
          }

          // Prefer concept slides (short titles) over long video titles
          if (card.title.length > 50) score -= 10;
          if (card.title.length < 30) score += 5;

          // Has image = higher priority (we want to show visuals)
          if (card.content?.startsWith("IMG:")) score += 8;

          return { ...card, score };
        }).filter((c) => c.score > 5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4);

        const rankedCards = scoredCards.length > 0 ? scoredCards : [];

        // Discord: match by category from found cards, OR by concept keywords
        const matchedCategories = rankedCards.map((c) => c.category).filter(Boolean);
        let discord: Array<{ concept: string; thread_url: string }> | null = null;

        // First try matching by card categories
        if (matchedCategories.length > 0) {
          const catFilters = [...new Set(matchedCategories)].map((c: string) => `concept.eq.${c}`).join(",");
          const { data } = await supabase.from("discord_references").select("concept, thread_url").or(catFilters).limit(2);
          discord = data;
        }
        // Then try concept name matching
        if (!discord?.length && matchedConcepts.length > 0) {
          const conceptFilters = matchedConcepts.map((c) => `concept.ilike.%${c}%,description.ilike.%${c}%`).join(",");
          const { data } = await supabase.from("discord_references").select("concept, thread_url").or(conceptFilters).limit(2);
          discord = data;
        }
        // Fallback: keyword search
        if (!discord?.length) {
          const descFilters = words.filter((w: string) => w.length > 3).map((w: string) => `concept.ilike.%${w}%,description.ilike.%${w}%`).join(",");
          if (descFilters) {
            const { data } = await supabase.from("discord_references").select("concept, thread_url").or(descFilters).limit(2);
            discord = data;
          }
        }

        if (rankedCards.length) {
          studyMaterials.cards = rankedCards;
          studyContext += "\nSTUDY CARDS:\n" + rankedCards.map((g) => {
            const slideImg = g.content?.startsWith("IMG:") ? " [HAS SLIDE IMAGE]" : "";
            return `- ${g.title} (${g.category})${slideImg}`;
          }).join("\n");
        }
        if (discord?.length) {
          studyMaterials.discord = discord;
          studyContext += "\nDISCORD THREADS: " + discord.map((d) => `${d.concept}: ${d.thread_url}`).join("; ");
        }
      }
    }

    // Extract source video names from RAG context
    if (ragContext) {
      const videoMatches = ragContext.match(/\[([^\]]+)\]:/g);
      if (videoMatches) {
        const names = videoMatches.map(m => m.replace(/[\[\]:]/g, "").trim()).filter(v => v !== "SMC");
        studyMaterials.sources = names.map(v => ({
          video: v,
          url: `https://www.youtube.com/results?search_query=SMC+${encodeURIComponent(v)}`,
          isSearch: true,
        }));
      }
    }

    // If no sources found from RAG, search for matching videos directly
    if (studyMaterials.sources.length === 0 && lastUserMessage) {
      const searchWords = lastUserMessage.content.toLowerCase()
        .replace(/[?!.,;:'"]/g, "")
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !new Set(["what", "how", "does", "explain", "about", "trading", "market"]).has(w))
        .slice(0, 3);

      if (searchWords.length > 0) {
        const videoFilter = searchWords.map((w: string) => `source_video.ilike.%${w}%`).join(",");
        const { data: videos } = await supabase
          .from("knowledge_chunks")
          .select("source_video")
          .or(videoFilter)
          .not("source_video", "is", null)
          .limit(30);

        if (videos?.length) {
          // Deduplicate and take top 3
          const unique = [...new Set(videos.map((v: { source_video: string }) => v.source_video).filter(Boolean))].slice(0, 3);
          studyMaterials.sources = unique.map(v => ({
            video: v as string,
            url: `https://www.youtube.com/results?search_query=SMC+${encodeURIComponent(v as string)}`,
          }));
        }
      }
    }

    const systemPromptWithRAG = SMC_SYSTEM_PROMPT + ragContext + studyContext;

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
      // Try models in order of preference
      const modelsToTry = [
        "claude-sonnet-4-5-20250929",
        "claude-3-5-sonnet-20241022",
        "claude-3-5-sonnet-20240620",
        "claude-3-haiku-20240307",
      ];

      for (const tryModel of modelsToTry) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey.encrypted_key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: tryModel,
            max_tokens: 1024,
            system: systemPromptWithRAG,
            messages: messages.map((m: { role: string; content: string }) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const reply = data.content?.[0]?.text || "No response from Claude.";
          return NextResponse.json({ reply, provider: "claude", model: tryModel, studyMaterials });
        }

        // Only retry on model-not-found errors
        if (response.status !== 404 && response.status !== 400) {
          const err = await response.json().catch(() => ({}));
          return NextResponse.json(
            { error: err?.error?.message || "Claude API error" },
            { status: response.status }
          );
        }
      }

      return NextResponse.json({ error: "No compatible Claude model found" }, { status: 400 });

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
