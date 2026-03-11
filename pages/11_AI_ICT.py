import streamlit as st
import json
import os
import re

from lib.knowledge.vector_store import query_similar, get_collection_stats
from lib.ai_providers import get_provider
from lib.auth import get_current_user_id, has_api_key

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

# ============================================================
# CONCEPT SLIDES — load index + matching
# ============================================================

SLIDES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "knowledge_base", "concept_slides")
INDEX_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "knowledge_base", "concept_index.json")

@st.cache_data(ttl=3600)
def _load_concept_index():
    """Load the concept-to-slide mapping."""
    try:
        with open(INDEX_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return None

def find_matching_slides(question: str, response: str = "", max_slides: int = 4) -> list[dict]:
    """Match a question/response to relevant concept slides.
    Prioritizes concepts that match the question over ones only in the response.
    Scores by keyword length (specificity) to avoid generic keywords stealing slots.
    Returns list of {file, title, collection, discord_thread, gamma_url}."""
    index = _load_concept_index()
    if not index:
        return []

    q_lower = question.lower()
    r_lower = response.lower() if response else ""

    # Score each concept: question matches get priority, longer keywords score higher
    scored_concepts = []
    for concept_name, concept_data in index.get("concepts", {}).items():
        best_score = 0
        for kw in concept_data.get("keywords", []):
            if kw in q_lower:
                # Question match: base 1000 + keyword length for specificity
                best_score = max(best_score, 1000 + len(kw))
            elif kw in r_lower:
                # Response-only match: just keyword length
                best_score = max(best_score, len(kw))
        if best_score > 0:
            scored_concepts.append((best_score, concept_name, concept_data))

    # Sort by score descending — question matches first, then most specific
    scored_concepts.sort(key=lambda x: x[0], reverse=True)

    matches = []
    seen_files = set()
    for _score, _name, concept_data in scored_concepts:
        for slide in concept_data.get("slides", []):
            if slide["file"] in seen_files:
                continue
            seen_files.add(slide["file"])
            coll_key = slide.get("collection", "")
            coll = index.get("collections", {}).get(coll_key, {})
            matches.append({
                "file": slide["file"],
                "title": slide["title"],
                "collection_label": coll.get("label", ""),
                "discord_thread": coll.get("discord_thread"),
                "gamma_url": coll.get("gamma_url"),
            })
        if len(matches) >= max_slides:
            break

    return matches[:max_slides]


def render_concept_slides(slides: list[dict], msg_idx: int = 0):
    """Display matched concept slides as a slideshow with prev/next nav."""
    # Filter to only slides that have valid image files
    valid_slides = []
    for s in slides:
        if s.get("file"):
            img_path = os.path.join(SLIDES_DIR, s["file"])
            if os.path.exists(img_path):
                valid_slides.append(s)
        elif s.get("discord_thread"):
            # Keep slides with Discord links even without images
            valid_slides.append(s)

    if not valid_slides:
        return

    # Session state key unique per message
    ss_key = f"slide_idx_{msg_idx}"
    if ss_key not in st.session_state:
        st.session_state[ss_key] = 0

    idx = st.session_state[ss_key]
    idx = max(0, min(idx, len(valid_slides) - 1))
    slide = valid_slides[idx]

    st.markdown(
        '<div style="color:#e8651a; font-size:0.7rem; font-weight:700; letter-spacing:1.5px; '
        'text-transform:uppercase; margin:16px 0 8px 0; border-top:1px solid #1e1a17; '
        'padding-top:12px;">STUDY MATERIALS</div>',
        unsafe_allow_html=True,
    )

    # Show current slide image
    if slide.get("file"):
        img_path = os.path.join(SLIDES_DIR, slide["file"])
        if os.path.exists(img_path):
            st.image(img_path, use_container_width=True)

    # Slide title + counter
    total = len(valid_slides)
    title = slide.get("title", "")
    st.markdown(
        f'<div style="text-align:center; margin:6px 0 2px 0;">'
        f'<span style="color:#e8651a; font-weight:600; font-size:0.85rem;">{title}</span>'
        f'<span style="color:#555; font-size:0.75rem; margin-left:10px;">{idx + 1} / {total}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

    # Links row (centered)
    links = []
    if slide.get("discord_thread"):
        links.append(f"[Study in Discord]({slide['discord_thread']})")
    if slide.get("collection_label"):
        links.append(f"*{slide['collection_label']}*")
    if links:
        st.caption(" · ".join(links))

    # Prev / Next buttons (only if multiple slides)
    if total > 1:
        c_prev, c_dot, c_next = st.columns([1, 6, 1])
        with c_prev:
            if st.button("◀", key=f"sprev_{msg_idx}", use_container_width=True):
                st.session_state[ss_key] = (idx - 1) % total
                st.rerun()
        with c_next:
            if st.button("▶", key=f"snext_{msg_idx}", use_container_width=True):
                st.session_state[ss_key] = (idx + 1) % total
                st.rerun()


# ============================================================
# PAGE CSS
# ============================================================

st.markdown("""
<style>
    /* Kill top padding */
    .block-container { padding-top: 1rem !important; }

    /* Chat message headers — orange like analysis page */
    [data-testid="stChatMessage"] h4 {
        color: #e8651a !important;
        font-size: 1rem !important;
        font-weight: 700 !important;
        margin-top: 1rem !important;
        margin-bottom: 0.4rem !important;
        border-bottom: 1px solid #1e1a17;
        padding-bottom: 4px;
    }
    /* First h4 in a message needs no top margin */
    [data-testid="stChatMessage"] h4:first-of-type {
        margin-top: 0.2rem !important;
    }
    /* Bold terms inside chat — slightly orange tint */
    [data-testid="stChatMessage"] strong {
        color: #f0f0f0 !important;
    }

    /* Slideshow prev/next buttons */
    [data-testid="stChatMessage"] [data-testid="stHorizontalBlock"] button[kind="secondary"] {
        background: transparent !important;
        border: 1px solid #333 !important;
        color: #e8651a !important;
        font-size: 0.85rem !important;
        padding: 4px 0 !important;
        min-height: 0 !important;
        height: 28px !important;
        border-radius: 6px !important;
    }
    [data-testid="stChatMessage"] [data-testid="stHorizontalBlock"] button[kind="secondary"]:hover {
        border-color: #e8651a !important;
        background: rgba(232,101,26,0.08) !important;
    }

    /* Suggested question buttons — compact */
    .st-key-suggest_grid [data-testid="stVerticalBlock"] {
        gap: 14px !important;
    }
    .st-key-suggest_grid button {
        background: #111 !important;
        border: 1px solid #1e1a17 !important;
        border-radius: 6px !important;
        color: #ccc !important;
        font-size: 0.78rem !important;
        padding: 8px 12px !important;
        text-align: left !important;
        transition: all 0.2s ease !important;
        min-height: 0 !important;
    }
    .st-key-suggest_grid button:hover {
        border-color: #e8651a !important;
        color: #e8651a !important;
        background: rgba(232,101,26,0.06) !important;
    }

    /* Clear chat button */
    .st-key-clear_ict_chat button {
        background: transparent !important;
        border: 1px solid #333 !important;
        color: #666 !important;
        font-size: 0.75rem !important;
        padding: 4px 14px !important;
        min-height: 0 !important;
        height: auto !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
    }
    .st-key-clear_ict_chat button:hover {
        border-color: #ef4444 !important;
        color: #ef4444 !important;
    }

    /* KB pill */
    .kb-pill {
        display: inline-block;
        background: #141414;
        border: 1px solid #1e1a17;
        border-radius: 20px;
        padding: 4px 14px;
        color: #888;
        font-size: 0.72rem;
        letter-spacing: 0.5px;
        margin-bottom: 18px;
    }
    .kb-pill .dot {
        display: inline-block;
        width: 6px; height: 6px;
        background: #e8651a;
        border-radius: 50%;
        margin-right: 6px;
        vertical-align: middle;
    }

    /* Chat avatar */
    .stChatMessage [data-testid="chatAvatarIcon-assistant"] {
        background: #e8651a !important;
    }

    /* ============ UNIFIED CHAT BAR ============ */
    .st-key-chat_bar {
        background: #141414;
        border: 1px solid #2a2a2a;
        border-radius: 22px;
        padding: 2px 4px;
        margin-top: 20px;
    }
    /* Kill all inner gaps */
    .st-key-chat_bar [data-testid="stHorizontalBlock"] {
        gap: 0 !important;
        align-items: center !important;
    }
    .st-key-chat_bar [data-testid="stVerticalBlock"] {
        gap: 0 !important;
    }
    .st-key-chat_bar [data-testid="stVerticalBlockBorderWrapper"] {
        padding: 0 !important;
    }
    .st-key-chat_bar [data-testid="stColumn"] {
        padding: 0 !important;
    }
    .st-key-chat_bar [data-testid="stColumn"] > div,
    .st-key-chat_bar [data-testid="stColumn"] > div > div {
        padding: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
    }
    .st-key-chat_bar [data-testid="stElementToolbar"] {
        display: none !important;
    }
    /* Text input — borderless, transparent */
    .st-key-chat_bar .stTextInput {
        margin-bottom: 0 !important;
    }
    .st-key-chat_bar .stTextInput > div {
        margin-bottom: 0 !important;
    }
    .st-key-chat_bar .stTextInput > div > div {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
    }
    .st-key-chat_bar .stTextInput input {
        background: transparent !important;
        border: none !important;
        color: #ddd !important;
        box-shadow: none !important;
        caret-color: #e8651a !important;
        padding: 8px 8px !important;
        font-size: 0.9rem !important;
    }
    .st-key-chat_bar .stTextInput input:focus {
        border: none !important;
        box-shadow: none !important;
        outline: none !important;
    }
    .st-key-chat_bar .stTextInput input::placeholder {
        color: #555 !important;
    }
    /* Remove button wrapper margins */
    .st-key-chat_bar .stButton {
        margin-bottom: 0 !important;
    }
    /* + button column — push content left */
    .st-key-chat_bar [data-testid="stVerticalBlock"]:has(.st-key-ict_plus) {
        align-items: center !important;
        padding-left: 8px !important;
    }
    .st-key-ict_plus button {
        background: transparent !important;
        border: none !important;
        color: #888 !important;
        font-size: 1.9rem !important;
        padding: 0 !important;
        min-height: 0 !important;
        line-height: 1 !important;
        transition: color 0.2s ease !important;
    }
    .st-key-ict_plus button:hover {
        color: #e8651a !important;
    }
    /* Send button column — push content right */
    .st-key-chat_bar [data-testid="stColumn"]:last-child {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-end !important;
        padding-right: 26px !important;
    }
    .st-key-chat_bar [data-testid="stColumn"]:last-child > div,
    .st-key-chat_bar [data-testid="stColumn"]:last-child > div > div,
    .st-key-chat_bar [data-testid="stColumn"]:last-child [data-testid="stVerticalBlock"],
    .st-key-chat_bar [data-testid="stColumn"]:last-child .stElementContainer,
    .st-key-chat_bar [data-testid="stColumn"]:last-child .stButton {
        width: 100% !important;
        display: flex !important;
        justify-content: flex-end !important;
        align-items: center !important;
    }
    .st-key-ict_send button {
        background: transparent !important;
        border: none !important;
        color: #e8651a !important;
        font-size: 1.9rem !important;
        font-weight: 700 !important;
        padding: 0 !important;
        min-height: 0 !important;
        line-height: 1 !important;
        transition: color 0.2s ease !important;
    }
    .st-key-ict_send button:hover {
        color: #ff7e33 !important;
    }

    /* Upload area above bar */
    .st-key-ict_upload_area {
        margin-bottom: 6px;
    }
    .st-key-ict_upload_area [data-testid="stFileUploader"] {
        background: #111 !important;
        border: 1px dashed #2a2a2a !important;
        border-radius: 10px !important;
        padding: 6px !important;
    }
    .st-key-ict_upload_area [data-testid="stFileUploader"] section {
        padding: 4px !important;
    }
</style>
""", unsafe_allow_html=True)

# ============================================================
# HEADER
# ============================================================

st.markdown(
    '<div style="font-size:1.6rem; font-weight:700; color:#e8651a; letter-spacing:3px; '
    'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15); '
    'margin-bottom:6px;">AI ICT MENTOR</div>'
    '<div style="color:#888; font-size:0.82rem; margin-bottom:16px;">'
    'Ask anything about ICT methodology &mdash; powered by 675+ of ICT\'s YouTube lectures.</div>',
    unsafe_allow_html=True,
)

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

# Check knowledge base
kb_stats = get_collection_stats()
has_knowledge_base = kb_stats["total_chunks"] > 0

# KB status pill
model_name = st.session_state.get("ai_model", "claude-sonnet-4-6")
if has_knowledge_base:
    kb_label = f'{provider_name} ({model_name}) + {kb_stats["total_chunks"]} ICT teachings'
else:
    kb_label = f'{provider_name} ({model_name}) &mdash; general ICT knowledge'
st.markdown(f'<div class="kb-pill"><span class="dot"></span>{kb_label}</div>', unsafe_allow_html=True)

# ============================================================
# SYSTEM PROMPT
# ============================================================

ICT_CHAT_SYSTEM_PROMPT = """You are an expert ICT (Inner Circle Trader) methodology mentor with deep knowledge of Michael J. Huddleston's teachings from 675+ YouTube lectures.

## Response Style
- Keep answers **concise** — aim for 150-300 words unless the topic truly needs more
- Lead with a clear 1-2 sentence definition, then practical details
- Use ICT's exact terminology and frameworks
- Be direct — traders want actionable knowledge, not essays

## Response Structure
Always structure your response using these sections with markdown headers:

#### What It Is
A clear 2-3 sentence definition of the concept with **bold** ICT terms.

#### Key Rules
- ⚡ **Rule name** — brief explanation
- ⚡ **Rule name** — brief explanation
(Use ⚡ emoji bullets, 3-5 key rules, bold the rule name)

#### How to Trade It
1. Step one with **bold** key terms
2. Step two
3. Step three
(Numbered steps, 3-5 max)

#### Pro Tip
💡 One practical takeaway — make it memorable and actionable.

## Formatting Rules
- Use **bold** for key ICT terms when first introduced
- Use #### headers (h4) for section titles — they render in orange
- Use ⚡ for rules, ✅ for confirmations, ⚠️ for warnings/cautions, 💡 for tips
- Do NOT use code blocks, ASCII art, or text-based diagrams — visual study slides are shown automatically below your response
- Keep paragraphs to 2-3 sentences max
- Reference specific video titles from context in *italics* so traders can study the source

## Boundaries
- Only teach ICT methodology — note if asked about other systems
- Say "ICT hasn't specifically covered this" rather than guessing
- Always remind: no setup is 100% — risk management first"""

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

if "ict_show_upload" not in st.session_state:
    st.session_state.ict_show_upload = False

# ============================================================
# SUGGESTED QUESTIONS (only show when chat is empty)
# ============================================================

if not st.session_state.ict_chat_messages:
    st.markdown(
        '<div style="color:#e8651a; font-size:0.65rem; font-weight:700; letter-spacing:2px; '
        'text-transform:uppercase; margin:20px 0 14px 0;">SUGGESTED QUESTIONS</div>',
        unsafe_allow_html=True,
    )

    with st.container(key="suggest_grid"):
        cols = st.columns(2)
        for i, q in enumerate(SUGGESTED_QUESTIONS):
            with cols[i % 2]:
                if st.button(q, key=f"suggest_{i}", use_container_width=True):
                    st.session_state.ict_chat_messages.append({"role": "user", "content": q})
                    st.session_state["ict_trigger_response"] = True
                    st.rerun()

# ============================================================
# DISPLAY CHAT HISTORY
# ============================================================

for _mi, msg in enumerate(st.session_state.ict_chat_messages):
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

        # Show concept slides if matched
        if msg["role"] == "assistant" and "slides" in msg:
            render_concept_slides(msg["slides"], msg_idx=_mi)

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
# PROCESS QUESTION
# ============================================================

def process_question(question: str, images: list[tuple[bytes, str]] | None = None):
    """Retrieve RAG context and get AI response. Returns (text, sources, usage)."""
    results = []
    if has_knowledge_base:
        try:
            results = query_similar(question, n_results=8)
        except Exception:
            results = []

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

    system_with_context = ICT_CHAT_SYSTEM_PROMPT
    if rag_context:
        system_with_context += f"""

## Relevant ICT Teachings from YouTube Lectures

The following excerpts from ICT's actual YouTube lectures are relevant to this conversation.
Use these as your primary source material. Reference specific video titles when applicable.

{rag_context}

---

Use the above teachings to inform your response. Cite video titles where relevant so the trader can study the source material."""

    provider_name = st.session_state.get("ai_provider", "Claude")
    model = st.session_state.get("ai_model", "claude-sonnet-4-6")

    try:
        provider = get_provider(provider_name, model)
        response, usage = provider.chat(
            system_prompt=system_with_context,
            messages=st.session_state.ict_chat_messages,
            images=images,
        )
        return response, sources, usage
    except Exception as e:
        return f"Error: {str(e)}", [], {}


# Handle triggered response (from suggested questions)
if st.session_state.get("ict_trigger_response"):
    del st.session_state["ict_trigger_response"]
    question = st.session_state.ict_chat_messages[-1]["content"]

    with st.chat_message("assistant"):
        with st.spinner("Consulting ICT's teachings..."):
            response, sources, usage = process_question(question)
            st.markdown(response)
            slides = find_matching_slides(question, response)
            render_concept_slides(slides, msg_idx=len(st.session_state.ict_chat_messages))

    st.session_state.ict_chat_messages.append({
        "role": "assistant",
        "content": response,
        "sources": sources,
        "slides": slides,
        "usage": usage,
    })
    st.rerun()

# ============================================================
# PROCESS PENDING MESSAGE (from chat bar submit)
# ============================================================

if st.session_state.get("ict_pending_msg"):
    question = st.session_state.pop("ict_pending_msg")
    images = st.session_state.pop("ict_chat_images", None)
    st.session_state.ict_show_upload = False

    st.session_state.ict_chat_messages.append({"role": "user", "content": question})

    with st.chat_message("user"):
        if images:
            st.image(images[0][0], caption="Attached chart", width=300)
        st.markdown(question)

    with st.chat_message("assistant"):
        with st.spinner("Consulting ICT's teachings..."):
            response, sources, usage = process_question(question, images)
            st.markdown(response)
            slides = find_matching_slides(question, response)
            render_concept_slides(slides, msg_idx=len(st.session_state.ict_chat_messages))

    st.session_state.ict_chat_messages.append({
        "role": "assistant",
        "content": response,
        "sources": sources,
        "slides": slides,
        "usage": usage,
    })
    st.rerun()

# ============================================================
# SUBMIT CALLBACK (fires on Enter in text input)
# ============================================================

def _on_ict_submit():
    msg = st.session_state.get("ict_msg", "").strip()
    if msg and not st.session_state.get("ict_pending_msg"):
        st.session_state["ict_pending_msg"] = msg
        st.session_state["ict_msg"] = ""

# ============================================================
# IMAGE UPLOAD (above chat bar, only when toggled)
# ============================================================

if st.session_state.ict_show_upload:
    with st.container(key="ict_upload_area"):
        uploaded_screenshot = st.file_uploader(
            "Attach a chart",
            type=["jpg", "jpeg", "png", "webp"],
            key="ict_chat_image",
            label_visibility="collapsed",
        )
        if uploaded_screenshot:
            img_data = uploaded_screenshot.read()
            name_lower = uploaded_screenshot.name.lower()
            mime = "image/png" if name_lower.endswith(".png") else "image/webp" if name_lower.endswith(".webp") else "image/jpeg"
            st.session_state["ict_chat_images"] = [(img_data, mime)]
            uploaded_screenshot.seek(0)
            st.image(uploaded_screenshot, caption="Attached chart", width=200)
        else:
            st.session_state.pop("ict_chat_images", None)

# ============================================================
# UNIFIED CHAT BAR — +, input, send in one box
# ============================================================

with st.container(key="chat_bar"):
    c1, c2, c3 = st.columns([0.5, 8, 0.5])
    with c1:
        if st.button("\\+", key="ict_plus"):
            st.session_state.ict_show_upload = not st.session_state.ict_show_upload
            if not st.session_state.ict_show_upload:
                st.session_state.pop("ict_chat_images", None)
            st.rerun()
    with c2:
        st.text_input(
            "msg",
            placeholder="Ask about ICT Concepts...",
            label_visibility="collapsed",
            key="ict_msg",
            on_change=_on_ict_submit,
        )
    with c3:
        if st.button("\u2191", key="ict_send"):
            _on_ict_submit()
            if st.session_state.get("ict_pending_msg"):
                st.rerun()

# ============================================================
# CLEAR CHAT
# ============================================================

if st.session_state.ict_chat_messages:
    st.markdown('<div style="border-top:1px solid #1e1a17; margin:8px 0;"></div>', unsafe_allow_html=True)
    clear_l, clear_r = st.columns([9, 1])
    with clear_r:
        if st.button("Clear", key="clear_ict_chat"):
            st.session_state.ict_chat_messages = []
            st.rerun()
