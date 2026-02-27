import streamlit as st

from lib.knowledge.vector_store import query_similar, get_collection_stats
from lib.ai_providers import get_provider
from lib.auth import get_current_user_id, has_api_key

# ── Live price ticker ──
try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("AI ICT Mentor")
st.caption("Ask anything about ICT methodology — powered by 675+ of ICT's YouTube lectures.")

# Check for API key
user_id = get_current_user_id()
provider_name = st.session_state.get("ai_provider", "Claude")
key_provider = "anthropic" if provider_name == "Claude" else "gemini"

if not has_api_key(user_id, key_provider):
    st.warning(f"You need a **{provider_name}** API key to use AI chat.")
    st.markdown(
        "**How to get started:**\n"
        "1. Go to **Settings** in the sidebar\n"
        "2. Get a free API key from "
        + ("[console.anthropic.com](https://console.anthropic.com/settings/keys)" if provider_name == "Claude"
           else "[aistudio.google.com](https://aistudio.google.com/apikey)")
        + "\n3. Paste it in Settings and hit Save\n"
        "4. Come back here and start chatting!"
    )
    st.stop()

# Check knowledge base (optional — chat works without it, just no RAG context)
kb_stats = get_collection_stats()
has_knowledge_base = kb_stats["total_chunks"] > 0

if not has_knowledge_base:
    st.info("💡 Knowledge base not loaded — the AI will answer from its general ICT knowledge. "
            "For source-backed answers from ICT's actual lectures, run the indexer locally.")

# ============================================================
# SYSTEM PROMPT — ICT Teaching AI
# ============================================================

ICT_CHAT_SYSTEM_PROMPT = """You are an expert ICT (Inner Circle Trader) methodology mentor. You have deep knowledge of Michael J. Huddleston's ICT methodology from his extensive YouTube teaching library.

Your role:
- Answer questions about ICT concepts with precision and depth
- Explain concepts the way ICT teaches them — use his terminology and frameworks
- Reference specific teachings and videos when provided in context
- Be direct and practical — traders want actionable knowledge
- Use examples to illustrate concepts (e.g., "If price sweeps buy-side liquidity above the previous day high, then displaces lower with a bearish FVG...")
- When explaining entries, always emphasize: timing (kill zones), direction (HTF bias), and confirmation (displacement, MSS)
- Correct misconceptions about ICT methodology firmly but respectfully

Formatting:
- Use markdown headers and bullet points for clarity
- Bold key ICT terms when first introduced
- Keep responses focused and practical — avoid padding
- If referencing a specific video from the context, mention the title so the trader can study it

Important:
- Only teach ICT methodology. If asked about other trading systems, note that you specialize in ICT
- If you're not sure about something specific to ICT's teaching, say so rather than guessing
- Emphasize that no setup is 100% — risk management is always the priority"""


# ============================================================
# SUGGESTED QUESTIONS
# ============================================================

SUGGESTED_QUESTIONS = [
    "What is an Order Block and how do I trade it?",
    "Explain the Power of 3 (AMD) for the NY session",
    "How do I find the OTE zone after a market structure shift?",
    "What is the Silver Bullet setup?",
    "How do kill zones work and which should I focus on?",
    "What's the difference between a breaker block and an order block?",
    "How do I identify a Judas Swing?",
    "Explain Fair Value Gaps and consequent encroachment",
    "What is institutional order flow and how do I read it?",
    "How should I use premium and discount zones for entries?",
]

# ============================================================
# CHAT STATE
# ============================================================

if "ict_chat_messages" not in st.session_state:
    st.session_state.ict_chat_messages = []

# ============================================================
# SUGGESTED QUESTIONS (only show when chat is empty)
# ============================================================

if not st.session_state.ict_chat_messages:
    st.markdown("**Ask me anything about ICT methodology:**")
    st.write("")

    # Show suggested questions as buttons in a grid
    cols = st.columns(2)
    for i, q in enumerate(SUGGESTED_QUESTIONS):
        with cols[i % 2]:
            if st.button(q, key=f"suggest_{i}", use_container_width=True):
                st.session_state.ict_chat_messages.append({"role": "user", "content": q})
                st.session_state["ict_trigger_response"] = True
                st.rerun()

    st.divider()

# ============================================================
# DISPLAY CHAT HISTORY
# ============================================================

for msg in st.session_state.ict_chat_messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

        # Show sources if present
        if msg["role"] == "assistant" and "sources" in msg:
            with st.expander("Sources from ICT's teachings"):
                for src in msg["sources"]:
                    tags = ", ".join(src["concept_tags"]) if src["concept_tags"] else ""
                    st.markdown(f"**{src['video_title']}**")
                    if tags:
                        st.caption(f"Concepts: {tags}")
                    if src["video_url"]:
                        st.markdown(f"[Watch on YouTube]({src['video_url']})")
                    st.divider()

# ============================================================
# CHAT INPUT
# ============================================================

def process_question(question: str):
    """Retrieve RAG context and get AI response."""
    # Retrieve relevant ICT teachings (if knowledge base is available)
    results = []
    if has_knowledge_base:
        try:
            results = query_similar(question, n_results=8)
        except Exception:
            results = []

    # Build context from retrieved chunks
    rag_sections = []
    sources = []
    for i, r in enumerate(results, 1):
        tags = ", ".join(r["concept_tags"]) if r["concept_tags"] else "General"
        rag_sections.append(
            f"[Source {i}] {r['video_title']}\n"
            f"Concepts: {tags}\n"
            f"{r['text'][:600]}"
        )
        sources.append({
            "video_title": r["video_title"],
            "video_url": r["video_url"],
            "concept_tags": r["concept_tags"],
        })

    rag_context = "\n\n---\n\n".join(rag_sections)

    # Build the system prompt with RAG context
    system_with_context = ICT_CHAT_SYSTEM_PROMPT
    if rag_context:
        system_with_context += f"""

## Relevant ICT Teachings from YouTube Lectures

The following excerpts from ICT's actual YouTube lectures are relevant to this conversation.
Use these as your primary source material. Reference specific video titles when applicable.

{rag_context}

---

Use the above teachings to inform your response. Cite video titles where relevant so the trader can study the source material."""

    # Get AI response
    provider_name = st.session_state.get("ai_provider", "Claude")
    model = st.session_state.get("ai_model", "claude-sonnet-4-5-20250514")

    try:
        provider = get_provider(provider_name, model)
        response = provider.chat(
            system_prompt=system_with_context,
            messages=st.session_state.ict_chat_messages,
        )
        return response, sources
    except Exception as e:
        return f"Error: {str(e)}", []


# Handle triggered response (from suggested questions)
if st.session_state.get("ict_trigger_response"):
    del st.session_state["ict_trigger_response"]
    question = st.session_state.ict_chat_messages[-1]["content"]

    with st.chat_message("assistant"):
        with st.spinner("Consulting ICT's teachings..."):
            response, sources = process_question(question)
            st.markdown(response)

    st.session_state.ict_chat_messages.append({
        "role": "assistant",
        "content": response,
        "sources": sources,
    })
    st.rerun()

# Chat input
if prompt := st.chat_input("Ask about ICT methodology..."):
    st.session_state.ict_chat_messages.append({"role": "user", "content": prompt})

    with st.chat_message("user"):
        st.markdown(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Consulting ICT's teachings..."):
            response, sources = process_question(prompt)
            st.markdown(response)

    st.session_state.ict_chat_messages.append({
        "role": "assistant",
        "content": response,
        "sources": sources,
    })
    st.rerun()

# Clear chat button
if st.session_state.ict_chat_messages:
    st.divider()
    if st.button("Clear Chat", key="clear_ict_chat"):
        st.session_state.ict_chat_messages = []
        st.rerun()
