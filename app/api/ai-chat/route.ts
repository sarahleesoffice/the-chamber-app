import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderError, generate, pickKey } from "@/lib/ai-providers";
import { getUserApiKeys } from "@/lib/api-keys";
import { accessDenied } from "@/lib/access";
import { ndjsonResponse } from "@/lib/ndjson";
import { SMC_CONCEPTS, detectConcepts, findLectureExcerpts } from "@/lib/smc-concepts";

const SMC_SYSTEM_PROMPT = `You are the AI mentor inside "The Chamber" — a trading app built on SMC (Smart Money Concepts) methodology, powered by 675+ SMC YouTube lecture transcripts, study cards, and Discord discussions.

RESPONSE FORMAT — You MUST follow this structure for EVERY response:

1. **Answer the question** from the LECTURE EXCERPTS and study materials provided. Build the answer on what the lectures actually teach: their specific rules, conditions, times and examples. Don't fall back on generic trading advice when the excerpts cover the topic; if they don't cover it, say so briefly and keep general knowledge to a minimum.

2. **📘 Study Cards** — If study cards are provided below, include a section at the end listing ONLY the cards that directly relate to the user's question (skip the rest; if none fit, leave the section out):
   📘 **Related Study Cards:**
   - [Card Title]
   If a Gamma deck URL is provided, add: [View Study Deck](url)

3. **🎥 SMC Sources** — If transcript excerpts are provided, you MUST cite them:
   🎥 **From SMC Lectures:**
   - "[Video Title]" — [brief what was covered]

4. **💬 Discord** — If a Discord thread link is provided and it relates to the question, include at the very end (one link only):
   💬 **Study this topic in our Discord:** [full URL]

Rules:
- ALWAYS use the provided source materials to answer. Do NOT rely on general knowledge when sources are available.
- Include the study cards, video sources, and Discord sections when the provided items actually match what was asked. Never list an item just because it was provided.
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
    const denied = await accessDenied(user);
    if (denied) return denied;

    const { messages, stream } = await req.json();

    // RAG: lecture transcript excerpts for the question's topics. Started now so it
    // runs alongside the study-card lookup below; awaited before the model is called.
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === "user");
    const lecturesPromise = lastUserMessage ? findLectureExcerpts(supabase, lastUserMessage.content) : Promise.resolve([]);

    // RAG: Search Gamma cards + Discord
    let studyContext = "";
    const studyMaterials: { cards: Array<{ title: string; category: string; gamma_url: string; content: string }>; discord: Array<{ concept: string; thread_url: string }>; sources: Array<{ video: string; url: string }> } = { cards: [], discord: [], sources: [] };

    if (lastUserMessage) {
      const STOP_WORDS = new Set(["what", "how", "does", "the", "are", "is", "can", "you", "explain", "tell", "about", "smc", "trading", "trade", "market", "price", "use", "work", "mean", "definition", "define", "describe", "give", "show", "find", "help", "please", "would", "could", "should", "will", "this", "that", "with", "from", "have", "been", "being", "they", "them", "their", "which", "when", "where", "why", "who", "whom", "me", "do", "my", "for", "and", "any", "some"]);
      const words = lastUserMessage.content.toLowerCase()
        .replace(/[?!.,;:'"()]/g, "")
        .split(/\s+/)
        .filter((w: string) => w.length > 2 && !STOP_WORDS.has(w))
        .slice(0, 6);

      // Also extract multi-word phrases that match common SMC concepts
      const queryLower = lastUserMessage.content.toLowerCase();

      const matchedConcepts = detectConcepts(queryLower);

      if (words.length > 0 || matchedConcepts.length > 0) {
        const conceptTerms = [...new Set(matchedConcepts.flatMap((c) => SMC_CONCEPTS[c] || []))].filter((w) => w.length > 2);
        const queryTerms = [...new Set([...words, ...conceptTerms])];
        // Search by title AND tags for broader matching
        const titleFilters = queryTerms.map((w: string) => `title.ilike.%${w}%`).join(",");
        const { data: titleCards } = await supabase
          .from("gamma_cards")
          .select("title, category, gamma_url, content, tags")
          .neq("category", "Auto-indexed videos")
          .or(titleFilters)
          .limit(15);

        // Also search by tags array — overlap with keywords
        const tagFilters = queryTerms.map((w: string) => `tags.cs.{${w}}`).join(",");
        const { data: tagCards } = await supabase
          .from("gamma_cards")
          .select("title, category, gamma_url, content, tags")
          .neq("category", "Auto-indexed videos")
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

        const hasWord = (text: string, w: string) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(text);
        const scoredCards = Array.from(allCards.values()).filter((card) => /[a-z]/i.test(card.title)).map((card) => {
          const titleLower = card.title.toLowerCase().replace(/-/g, " ");
          let score = 0;
          // Does the card title cover the main topic (the first matched concept)?
          const main = matchedConcepts[0];
          const mainWords = main ? SMC_CONCEPTS[main] || [] : [];
          const onMainTopic =
            !!main && (hasWord(titleLower, main) || (mainWords.length > 0 && mainWords.every((w) => hasWord(titleLower, w))));

          // Title matches a concept from the query; the main topic (first match) counts most
          matchedConcepts.forEach((concept, i) => {
            const weight = i === 0 ? 1 : 0.5;
            if (hasWord(titleLower, concept)) score += 80 * weight;
            // Also check if the concept keywords all appear in the title
            const cWords = SMC_CONCEPTS[concept] || [];
            const allPresent = cWords.every((w) => hasWord(titleLower, w));
            if (allPresent && cWords.length >= 1) score += 60 * weight;
          });

          // Exact full phrase match
          if (titleLower === queryPhrase) score += 100;
          else if (titleLower.includes(queryPhrase) && queryPhrase.length > 4) score += 40;

          // Word-level matching — more matching words = higher score
          let matchCount = 0;
          for (const w of allSearchTerms) {
            if (hasWord(titleLower, w)) {
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

          return { ...card, score, onMainTopic };
        }).filter((c) => c.score > 12)
          .sort((a, b) => b.score - a.score);

        // Cards on the main topic only; fall back to the other matches only if none exist
        const onTopic = scoredCards.filter((c) => c.onMainTopic);
        const rankedCards = (onTopic.length > 0 ? onTopic : scoredCards).slice(0, 3);

        // Discord: one thread, for the main topic. Threads are per study deck, and a deck
        // can hold cards on other topics, so pick by concept first and only fall back to
        // the top card's deck when that card matched a concept strongly. No loose keyword
        // fallback: every thread description shares generic words, which matched unrelated threads.
        const CONCEPT_THREAD: Record<string, string> = {
          "silver bullet": "SMC Silver Bullet",
          "unicorn": "Unicorn Model",
          "judas swing": "SMC Judas Swing",
          "2022 model": "Execution of the 2022 Model",
          "ote": "SMC Optimal Trade Entry (OTE)",
          "liquidity": "Liquidity Purge & Revert",
        };
        const threadName =
          matchedConcepts.map((c) => CONCEPT_THREAD[c]).find(Boolean) ||
          (rankedCards[0] && rankedCards[0].score >= 80 ? rankedCards[0].category : undefined);
        let discord: Array<{ concept: string; thread_url: string }> | null = null;
        if (threadName) {
          const { data } = await supabase.from("discord_references").select("concept, thread_url").eq("concept", threadName).limit(1);
          discord = data;
        }

        if (rankedCards.length) {
          studyMaterials.cards = rankedCards;
          studyContext += "\nSTUDY CARDS:\n" + rankedCards.map((g) => {
            const slideImg = g.content?.startsWith("IMG:") ? " [HAS SLIDE IMAGE]" : "";
            return `- ${g.title}${slideImg}`;
          }).join("\n");
        }
        if (discord?.length) {
          studyMaterials.discord = discord;
          studyContext += "\nDISCORD THREADS: " + discord.map((d) => `${d.concept}: ${d.thread_url}`).join("; ");
        }
      }
    }

    const lectures = await lecturesPromise;
    const ragContext = lectures.length
      ? "\n\nLECTURE EXCERPTS (from the SMC lecture transcripts — build your answer on these):\n" +
        lectures.map((l) => `[${l.video}]: ${l.text}`).join("\n\n")
      : "";

    // The lecture videos the excerpts came from (one entry per video)
    const lectureVideos = [...new Map(lectures.map((l) => [l.video, l])).values()];
    studyMaterials.sources = lectureVideos.map((l) => ({
      video: l.video,
      url: l.url || `https://www.youtube.com/results?search_query=SMC+${encodeURIComponent(l.video)}`,
    }));

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

    // Get user's API key (decrypted server-side): the provider they chose in
    // Settings, else the first they have
    const key = pickKey(await getUserApiKeys(user.id), user.user_metadata?.ai_provider);
    if (!key) {
      return NextResponse.json({ error: "No API key configured" }, { status: 400 });
    }

    const options = {
      provider: key.provider,
      apiKey: key.key,
      model: user.user_metadata?.openrouter_model,
      system: systemPromptWithRAG,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        text: m.content,
      })),
      maxTokens: 1024,
      effort: "low" as const,
    };

    // Streaming: the reply shows up word by word instead of after a long wait
    if (stream) {
      return ndjsonResponse(async (send) => {
        const { text, provider, model } = await generate(options, (t) => send({ t }));
        send({ done: true, reply: text || "No response from the AI.", provider, model, studyMaterials });
      });
    }

    const { text, provider, model } = await generate(options);
    return NextResponse.json({ reply: text || "No response from the AI.", provider, model, studyMaterials });
  } catch (err: unknown) {
    if (err instanceof AIProviderError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
