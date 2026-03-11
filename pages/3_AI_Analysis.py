import re
import calendar as cal_module
from collections import defaultdict
from datetime import date

import streamlit as st

from lib.database import (
    get_all_trades, get_analyses_for_trade, get_analyses_in_range,
    insert_analysis, delete_analysis, get_trade,
)
from lib.ai_providers import get_provider
from lib.ai_providers.prompts import ICT_SYSTEM_PROMPT
from lib.knowledge.vector_store import get_collection_stats
from lib.models import Analysis
from lib.auth import get_current_user_id, has_api_key

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass


# ============================================================
# HELPERS
# ============================================================

def _inline(text: str) -> str:
    """Handle bold and italic inline markdown."""
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'_(.+?)_', r'<em>\1</em>', text)
    return text


def _md_to_html(md_text: str) -> str:
    """Convert markdown analysis text to simple HTML for the styled card."""
    lines = md_text.split("\n")
    html_parts = []
    in_list = False

    for line in lines:
        stripped = line.strip()

        if in_list and not stripped.startswith("- ") and not stripped.startswith("* "):
            html_parts.append("</ul>")
            in_list = False

        if not stripped:
            html_parts.append("")
            continue

        if stripped.startswith("### "):
            html_parts.append(f"<h3>{_inline(stripped[4:])}</h3>")
        elif stripped.startswith("## "):
            html_parts.append(f"<h2>{_inline(stripped[3:])}</h2>")
        elif stripped.startswith("# "):
            html_parts.append(f"<h2>{_inline(stripped[2:])}</h2>")
        elif stripped == "---" or stripped == "***":
            html_parts.append("<hr>")
        elif stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                html_parts.append("<ul>")
                in_list = True
            html_parts.append(f"<li>{_inline(stripped[2:])}</li>")
        else:
            html_parts.append(f"<p>{_inline(stripped)}</p>")

    if in_list:
        html_parts.append("</ul>")

    return "\n".join(html_parts)


def _extract_score(text: str):
    """Pull ICT Score X/10 from analysis text. Returns float or None."""
    m = re.search(r'(?:ICT\s+)?Score[:\s]*(\d+(?:\.\d+)?)\s*/\s*10', text, re.IGNORECASE)
    return float(m.group(1)) if m else None


def _stat_card(label: str, value: str, color: str = "#f5f5f5") -> str:
    return (
        f'<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
        f'padding:14px 8px; text-align:center;">'
        f'<div style="color:#888; font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; '
        f'margin-bottom:4px;">{label}</div>'
        f'<div style="color:{color}; font-size:1.3rem; font-weight:700;">{value}</div>'
        f'</div>'
    )


# ── Analysis day dialog (must be at module level for @st.dialog) ──

@st.dialog("Analysis Detail", width="large")
def _show_analysis_day_dialog(date_str: str, analyses: list, uid: int):
    """Popup showing all analyses for a given date."""
    parts = date_str.split("-")
    display_date = f"{cal_module.month_name[int(parts[1])]} {int(parts[2])}, {parts[0]}"

    st.markdown(
        f'<div style="color:#e8651a; font-size:1.1rem; font-weight:700; letter-spacing:1px; '
        f'margin-bottom:12px;">{display_date}</div>',
        unsafe_allow_html=True,
    )

    # Delete button CSS
    st.markdown("""
    <style>
    [class*="st-key-acal_del_"] button {
        background: transparent !important;
        border: 1px solid #333 !important;
        color: #666 !important;
        font-size: 0.7rem !important;
        font-weight: 600 !important;
        letter-spacing: 0.5px !important;
        padding: 4px 12px !important;
        min-height: 0 !important;
        height: auto !important;
        border-radius: 4px !important;
        transition: all 0.2s ease !important;
    }
    [class*="st-key-acal_del_"] button:hover {
        border-color: #ef4444 !important;
        color: #ef4444 !important;
    }
    </style>
    """, unsafe_allow_html=True)

    for i, a in enumerate(analyses):
        # Fetch linked trade (if any)
        trade = get_trade(a.trade_id, user_id=uid) if a.trade_id and a.trade_id > 0 else None
        score = _extract_score(a.analysis_text)

        # Score + provider line
        score_html = ""
        if score is not None:
            s_color = "#22c55e" if score >= 7 else "#e8651a" if score >= 4 else "#ef4444"
            score_html = (
                f'<span style="background:rgba(232,101,26,0.1); border:1px solid rgba(232,101,26,0.25); '
                f'border-radius:4px; padding:2px 8px; color:{s_color}; font-weight:700; '
                f'font-size:0.85rem; margin-right:8px;">ICT {score}/10</span>'
            )

        provider_html = (
            f'<span style="color:#555; font-size:0.72rem;">'
            f'{a.provider} &middot; {a.model} &middot; {a.created_at[11:16]}</span>'
        )

        # Trade tag
        if trade:
            pnl_color = "#22c55e" if trade.pnl_pips > 0 else "#ef4444" if trade.pnl_pips < 0 else "#888"
            trade_tag = (
                f'<span style="color:#f5f5f5; font-weight:600; margin-right:8px;">{trade.pair}</span>'
                f'<span style="color:#888; font-size:0.8rem; margin-right:8px;">{trade.direction.upper()}</span>'
                f'<span style="color:{pnl_color}; font-weight:600; font-size:0.85rem;">{trade.pnl_pips:+.1f}p</span>'
            )
        else:
            trade_tag = '<span style="color:#666; font-size:0.8rem;">Standalone analysis</span>'

        # Header bar
        header_html = (
            f'<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">'
            f'<div style="display:flex; align-items:center; gap:8px;">{trade_tag}</div>'
            f'<div>{score_html}{provider_html}</div>'
            f'</div>'
        )

        st.markdown(header_html, unsafe_allow_html=True)

        # Full analysis in styled card
        with st.expander("View full analysis", expanded=False):
            st.markdown(
                f'<div class="analysis-card">{_md_to_html(a.analysis_text)}</div>',
                unsafe_allow_html=True,
            )

        # Delete button — right-aligned
        trash_col_l, trash_col_r = st.columns([8, 2])
        with trash_col_r:
            if st.button("Delete Analysis", key=f"acal_del_{a.id}_{i}"):
                delete_analysis(a.id, user_id=uid)
                st.rerun()

        if i < len(analyses) - 1:
            st.markdown('<div style="border-top:1px solid #1e1a17; margin:12px 0;"></div>', unsafe_allow_html=True)


def _inject_analysis_cal_css(key_prefix: str, cal_year: int, cal_month: int, today: date, daily_count: dict):
    """Inject CSS to style analysis calendar day cells."""
    _, last_day = cal_module.monthrange(cal_year, cal_month)
    css = "<style>\n"

    for day_num in range(1, last_day + 1):
        date_key = f"{cal_year}-{cal_month:02d}-{day_num:02d}"
        count = daily_count.get(date_key, 0)
        is_today = (cal_year == today.year and cal_month == today.month and day_num == today.day)

        if count > 0:
            bg = "rgba(232,101,26,0.12)"
            border_c = "rgba(232,101,26,0.27)"
            text_color = "#e8651a"
        else:
            bg = "#0e0e0e"
            border_c = "#1e1a17"
            text_color = "#555"

        if is_today:
            border_rule = "border: 2px solid #e8651a !important; box-shadow: 0 0 8px rgba(232,101,26,0.4), 0 0 16px rgba(232,101,26,0.15) !important;"
            day_num_color = "#f5f5f5"
        else:
            border_rule = f"border: 1px solid {border_c} !important;"
            day_num_color = "#e8651a" if count > 0 else "#555"

        container_cls = f"st-key-{key_prefix}_d_{day_num}"

        css += f"""
.{container_cls} button {{
    background: {bg} !important;
    {border_rule}
    border-radius: 8px !important;
    color: {text_color} !important;
    min-height: 80px !important;
    height: 80px !important;
    padding: {"22px 4px 6px 4px" if count > 0 else "6px 4px"} !important;
    font-weight: 700 !important;
    font-size: {"0.9rem" if count > 0 else "0.8rem"} !important;
    white-space: pre-line !important;
    line-height: 1.3 !important;
    cursor: {"pointer" if count > 0 else "default"} !important;
    transition: all 0.15s ease !important;
    position: relative !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
}}
"""
        if count > 0:
            n_label = "1 analysis" if count == 1 else f"{count} analyses"
            css += f"""
.{container_cls} button::before {{
    content: "{day_num}";
    display: block;
    position: absolute;
    top: 6px;
    left: 0; right: 0;
    text-align: center;
    color: {day_num_color};
    font-size: 0.7rem;
    font-weight: 400;
}}
.{container_cls} button::after {{
    content: "{n_label}";
    display: block;
    color: #888;
    font-size: 0.7rem;
    font-weight: 400;
    margin-top: 2px;
}}
.{container_cls} button:hover {{
    background: rgba(232,101,26,0.2) !important;
    border: 1px solid rgba(232,101,26,0.5) !important;
    color: #ff7e33 !important;
}}
.{container_cls} button:hover::before,
.{container_cls} button:hover::after {{
    color: #ff7e33 !important;
}}
"""
        else:
            css += f"""
.{container_cls} button:disabled {{
    background: {bg} !important;
    {border_rule}
    color: {text_color} !important;
    opacity: 1 !important;
    cursor: default !important;
}}
"""

    css += "</style>"
    st.markdown(css, unsafe_allow_html=True)


# ============================================================
# PAGE-LEVEL CSS
# ============================================================

st.markdown("""
<style>
    /* Section label — small orange tag */
    .section-tag {
        display: inline-block;
        color: #e8651a;
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 2px;
        text-transform: uppercase;
        background: rgba(232,101,26,0.08);
        border: 1px solid rgba(232,101,26,0.2);
        border-radius: 4px;
        padding: 3px 10px;
        margin-top: 20px;
        margin-bottom: 10px;
    }
    /* Chart slot label */
    .chart-slot-label {
        color: #e8651a;
        font-size: 0.82rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        margin-bottom: 6px;
    }
    .chart-slot-label .dim {
        color: #666;
        font-weight: 400;
        font-size: 0.78rem;
    }
    /* Analysis result card */
    .analysis-card {
        background: #111;
        border: 1px solid #1e1a17;
        border-left: 3px solid #e8651a;
        border-radius: 8px;
        padding: 24px 28px;
        margin-top: 12px;
        line-height: 1.7;
    }
    .analysis-card h1, .analysis-card h2, .analysis-card h3 {
        color: #e8651a !important;
        font-size: 1.05rem !important;
        letter-spacing: 1px;
        margin-top: 20px !important;
        margin-bottom: 6px !important;
        text-decoration: underline;
        text-decoration-color: rgba(232,101,26,0.35);
        text-underline-offset: 4px;
    }
    .analysis-card h1:first-child, .analysis-card h2:first-child, .analysis-card h3:first-child {
        margin-top: 0 !important;
    }
    .analysis-card p { color: #d0d0d0; margin-bottom: 8px; }
    .analysis-card strong { color: #f5f5f5; }
    .analysis-card ul { margin: 4px 0 12px 0; padding-left: 20px; }
    .analysis-card li { color: #d0d0d0; margin-bottom: 4px; }
    .analysis-card hr { border-color: #1e1a17; margin: 16px 0; }
    /* Score highlight */
    .score-badge {
        display: inline-block;
        background: rgba(232,101,26,0.12);
        border: 1px solid rgba(232,101,26,0.3);
        border-radius: 6px;
        padding: 8px 16px;
        color: #e8651a;
        font-size: 1.3rem;
        font-weight: 700;
        letter-spacing: 1px;
        margin: 8px 0;
    }
    /* Provider pill */
    .provider-pill {
        display: inline-block;
        background: #141414;
        border: 1px solid #2a2a2a;
        border-radius: 20px;
        padding: 4px 14px;
        color: #888;
        font-size: 0.75rem;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
    }
    .provider-pill .dot {
        display: inline-block;
        width: 6px; height: 6px;
        background: #e8651a;
        border-radius: 50%;
        margin-right: 6px;
        vertical-align: middle;
    }
    /* Analyze Next Trade button */
    .st-key-analyze_next button {
        background: transparent !important;
        border: 1px solid rgba(232,101,26,0.4) !important;
        color: #e8651a !important;
        font-weight: 600 !important;
        letter-spacing: 1px !important;
        transition: all 0.2s ease !important;
    }
    .st-key-analyze_next button:hover {
        background: rgba(232,101,26,0.1) !important;
        border-color: #e8651a !important;
        color: #ff7e33 !important;
    }
</style>
""", unsafe_allow_html=True)

# ============================================================
# HEADER
# ============================================================

st.markdown(
    '<div style="font-size:1.8rem; font-weight:700; color:#e8651a; letter-spacing:3px; '
    'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15); '
    'margin-bottom:4px;">AI ANALYSIS</div>'
    '<div style="color:#888; font-size:0.85rem; margin-bottom:16px;">'
    'Upload your chart screenshots &mdash; AI breaks down your trade using ICT methodology.</div>',
    unsafe_allow_html=True,
)

user_id = get_current_user_id()

# Check for API key
provider_name = st.session_state.get("ai_provider", "Claude")
key_provider = "anthropic" if provider_name == "Claude" else "gemini"

if not has_api_key(user_id, key_provider):
    st.warning(f"You need a **{provider_name}** API key to use AI Analysis.")
    st.markdown(
        "**How to get started:**\n"
        "1. Go to **Settings** in the sidebar\n"
        "2. Get a free API key from "
        + ("[console.anthropic.com](https://console.anthropic.com/settings/keys)" if provider_name == "Claude"
           else "[aistudio.google.com](https://aistudio.google.com/apikey)")
        + "\n3. Paste it in Settings and hit Save\n"
        "4. Come back here to analyze your trades!"
    )
    st.stop()

# ============================================================
# TRADE CONTEXT
# ============================================================

st.session_state.pop("analysis_preselect_trade_id", None)

# Reset counter — incrementing this gives every widget a new key, clearing all inputs
if "analysis_reset" not in st.session_state:
    st.session_state["analysis_reset"] = 0
_r = st.session_state["analysis_reset"]

tab_analyze, tab_history = st.tabs(["Analyze Charts", "Past Analyses"])

with tab_analyze:

    # ============================================================
    # CHART SCREENSHOTS
    # ============================================================

    st.markdown('<div class="section-tag" style="margin-top:6px;">CHART SCREENSHOTS</div>', unsafe_allow_html=True)

    col_htf, col_entry = st.columns(2)

    with col_htf:
        st.markdown(
            '<div class="chart-slot-label">'
            'HTF Bias <span class="dim">(Daily / 4H / 1H)</span></div>',
            unsafe_allow_html=True,
        )
        htf_chart = st.file_uploader(
            "HTF",
            type=["jpg", "jpeg", "png", "webp"],
            key=f"analysis_htf_chart_{_r}",
            label_visibility="collapsed",
        )
        if htf_chart:
            st.image(htf_chart, use_container_width=True)

    with col_entry:
        st.markdown(
            '<div class="chart-slot-label">'
            'Entry TF <span class="dim">(15m / 5m / 1m)</span></div>',
            unsafe_allow_html=True,
        )
        entry_chart = st.file_uploader(
            "Entry",
            type=["jpg", "jpeg", "png", "webp"],
            key=f"analysis_entry_chart_{_r}",
            label_visibility="collapsed",
        )
        if entry_chart:
            st.image(entry_chart, use_container_width=True)

    st.markdown('<div style="margin-top:14px;"></div>', unsafe_allow_html=True)
    with st.expander("Extra chart (optional)"):
        extra_chart = st.file_uploader(
            "Extra",
            type=["jpg", "jpeg", "png", "webp"],
            key=f"analysis_extra_chart_{_r}",
            label_visibility="collapsed",
        )
        if extra_chart:
            st.image(extra_chart, width=400)

    # ============================================================
    # TRADE DETAILS
    # ============================================================

    st.markdown('<div class="section-tag" style="margin-top:8px;">TRADE DETAILS</div>', unsafe_allow_html=True)

    col_date, col1, col2, col3, col4 = st.columns([1.2, 1, 1, 1, 1])
    with col_date:
        analysis_date = st.date_input("Date", value=date.today(), key=f"adate_{_r}")
    with col1:
        pair = st.text_input("Pair", value="", placeholder="ES, NQ, EU", key=f"pair_{_r}")
    with col2:
        direction = st.selectbox("Direction", ["Long", "Short"], index=0, key=f"dir_{_r}")
    with col3:
        entry_price = st.text_input("Entry", value="", placeholder="Price", key=f"entry_{_r}")
    with col4:
        exit_price = st.text_input("Exit", value="", placeholder="Price", key=f"exit_{_r}")

    reasoning = st.text_area(
        "What was your reasoning?",
        value="",
        placeholder="e.g. Bearish OB on 4H, waited for MSS on 15m during NY open, entered on FVG retest...",
        height=80,
        key=f"reasoning_{_r}",
    )

    what_to_focus = st.text_input(
        "Want feedback on something specific?",
        placeholder="e.g. Was my entry too early? Did I read the HTF bias correctly?",
        key=f"focus_{_r}",
    )

    # ============================================================
    # ANALYZE BUTTON
    # ============================================================

    provider_name = st.session_state.get("ai_provider", "Claude")
    model_name = st.session_state.get("ai_model", "claude-sonnet-4-6")

    kb_stats = get_collection_stats()
    has_any_chart = htf_chart or entry_chart or extra_chart

    st.write("")  # spacing

    if has_any_chart:
        chart_count = sum(1 for c in [htf_chart, entry_chart, extra_chart] if c)
        kb_label = f" + {kb_stats['total_chunks']} ICT teachings" if kb_stats["total_chunks"] > 0 else ""
        st.markdown(
            f'<div class="provider-pill"><span class="dot"></span>'
            f'{provider_name} ({model_name}){kb_label} &mdash; {chart_count} chart(s) ready</div>',
            unsafe_allow_html=True,
        )

    if st.button(
        "Analyze Trade" if has_any_chart else "Upload charts to analyze",
        type="primary",
        use_container_width=True,
        disabled=not has_any_chart,
    ):
        try:
            provider = get_provider(provider_name, model_name)
        except ValueError as e:
            st.error(str(e))
            st.stop()

        # Build images list
        images = []
        image_labels = []

        def _read_image(file_obj):
            file_obj.seek(0)
            data = file_obj.read()
            name = file_obj.name.lower()
            mime = "image/png" if name.endswith(".png") else "image/webp" if name.endswith(".webp") else "image/jpeg"
            return data, mime

        if htf_chart:
            images.append(_read_image(htf_chart))
            image_labels.append("Higher Timeframe (bias)")
        if entry_chart:
            images.append(_read_image(entry_chart))
            image_labels.append("Entry Timeframe (execution)")
        if extra_chart:
            images.append(_read_image(extra_chart))
            image_labels.append("Additional chart")

        # Build prompt
        chart_desc = ", ".join(image_labels)
        pnl_line = ""
        if entry_price and exit_price:
            pnl_line = f"\n**Entry:** {entry_price}  |  **Exit:** {exit_price}"

        prompt = f"""Analyze my trade using ICT methodology. I've attached {len(images)} chart screenshot(s): {chart_desc}.

**Pair:** {pair or 'Not specified'}
**Direction:** {direction}{pnl_line}

**My reasoning:** {reasoning or 'Not provided'}
"""
        if what_to_focus:
            prompt += f"\n**Specific question:** {what_to_focus}"

        prompt += """

Look at my chart screenshots carefully. Identify:
- Key ICT elements visible (Order Blocks, FVGs, liquidity levels, market structure)
- Whether my entry/exit aligned with ICT methodology
- What I did well and what I can improve
- Any ICT concepts I may have missed on the chart

Provide your full ICT methodology analysis following the structured format."""

        # RAG context
        rag_context = ""
        if kb_stats["total_chunks"] > 0:
            with st.spinner("Pulling relevant ICT teachings..."):
                try:
                    rag_query = f"{pair} {direction} {reasoning}"
                    from lib.knowledge.vector_store import query_similar
                    results = query_similar(rag_query, n_results=5)
                    rag_sections = []
                    for j, r in enumerate(results, 1):
                        tags = ", ".join(r["concept_tags"]) if r["concept_tags"] else "General"
                        rag_sections.append(f"[Source {j}] {r['video_title']}\nConcepts: {tags}\n{r['text'][:600]}")
                    rag_context = "\n\n---\n\n".join(rag_sections)
                except Exception:
                    pass

        system_prompt = ICT_SYSTEM_PROMPT
        if rag_context:
            system_prompt += f"""

## Relevant ICT Teachings from YouTube Lectures

{rag_context}

---

Reference specific video titles where relevant so the trader can study the source material."""

        with st.spinner("Analyzing trade..."):
            try:
                messages = [{"role": "user", "content": prompt}]
                result, _usage = provider.chat(system_prompt=system_prompt, messages=messages, images=images)
            except Exception as e:
                st.error(f"Analysis failed: {e}")
                st.stop()

        # Always save to Past Analyses calendar
        analysis = Analysis(
            trade_id=None,
            provider=provider.get_provider_name(),
            model=provider.get_model_name(),
            analysis_text=result,
        )
        save_dt = f"{analysis_date.isoformat()} {__import__('datetime').datetime.now().strftime('%H:%M:%S')}"
        insert_analysis(analysis, user_id=user_id, created_at=save_dt)

        # Store result so it persists across reruns
        st.session_state["last_analysis_result"] = result

    # Show analysis result + reset button OUTSIDE the button block so they persist
    if st.session_state.get("last_analysis_result"):
        st.markdown("---")
        st.markdown(
            f'<div class="analysis-card">{_md_to_html(st.session_state["last_analysis_result"])}</div>',
            unsafe_allow_html=True,
        )

        st.write("")
        if st.button(
            "Analyze Next Trade",
            use_container_width=True,
            key="analyze_next",
        ):
            st.session_state["analysis_reset"] += 1
            st.session_state.pop("last_analysis_result", None)
            st.rerun()

# ============================================================
# PAST ANALYSES — Calendar View
# ============================================================

with tab_history:
    today = date.today()
    kp = "acal"
    m_key, y_key = f"{kp}_month", f"{kp}_year"

    if m_key not in st.session_state:
        st.session_state[m_key] = today.month
        st.session_state[y_key] = today.year

    cal_month = st.session_state[m_key]
    cal_year = st.session_state[y_key]

    # Fetch analyses for this month
    month_start = f"{cal_year}-{cal_month:02d}-01"
    _, last_day = cal_module.monthrange(cal_year, cal_month)
    month_end = f"{cal_year}-{cal_month:02d}-{last_day:02d}"
    month_analyses = get_analyses_in_range(month_start, month_end, user_id=user_id)

    # Group by date
    daily_analyses = defaultdict(list)
    for a in month_analyses:
        a_date = a.created_at[:10]
        daily_analyses[a_date].append(a)
    daily_count = {d: len(lst) for d, lst in daily_analyses.items()}

    # Extract scores for avg
    all_scores = [s for a in month_analyses if (s := _extract_score(a.analysis_text)) is not None]
    avg_score = sum(all_scores) / len(all_scores) if all_scores else None

    # ── Header ──
    st.markdown(
        '<div style="margin-bottom:4px;">'
        '<div style="color:#f5f5f5; font-size:1.3rem; font-weight:700;">Analysis Calendar</div>'
        '<div style="color:#888; font-size:0.85rem;">Click a day to view your analyses</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Stat cards ──
    avg_str = f"{avg_score:.1f}/10" if avg_score else "—"
    avg_color = "#22c55e" if avg_score and avg_score >= 7 else "#e8651a" if avg_score and avg_score >= 4 else "#ef4444" if avg_score else "#888"

    cards = '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin:12px 0 16px 0;">'
    cards += _stat_card("Total Analyses", str(len(month_analyses)), "#f5f5f5")
    cards += _stat_card("Days Analyzed", str(len(daily_count)), "#e8651a")
    cards += _stat_card("Avg ICT Score", avg_str, avg_color)
    cards += '</div>'
    st.markdown(cards, unsafe_allow_html=True)

    # ── Month nav ──
    nav1, nav2, nav3, nav4 = st.columns([1, 4, 1, 1])

    with nav1:
        if st.button("< Prev", key=f"{kp}_prev"):
            if st.session_state[m_key] == 1:
                st.session_state[m_key] = 12
                st.session_state[y_key] -= 1
            else:
                st.session_state[m_key] -= 1
            st.rerun()

    with nav2:
        st.markdown(
            f'<div style="text-align:center; font-size:1.2rem; font-weight:600; color:#f5f5f5; '
            f'padding-top:6px;">{cal_module.month_name[cal_month]} {cal_year}</div>',
            unsafe_allow_html=True,
        )

    with nav3:
        if st.button("Today", key=f"{kp}_today"):
            st.session_state[m_key] = today.month
            st.session_state[y_key] = today.year
            st.rerun()

    with nav4:
        if st.button("Next >", key=f"{kp}_next"):
            if st.session_state[m_key] == 12:
                st.session_state[m_key] = 1
                st.session_state[y_key] += 1
            else:
                st.session_state[m_key] += 1
            st.rerun()

    # ── Day-of-week headers ──
    day_headers = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    header_html = '<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin:8px 0 4px 0;">'
    for dh in day_headers:
        header_html += (
            f'<div style="text-align:center; padding:6px; color:#888; font-size:0.75rem; '
            f'font-weight:600; text-transform:uppercase; letter-spacing:1px;">{dh}</div>'
        )
    header_html += '</div>'
    st.markdown(header_html, unsafe_allow_html=True)

    # ── Inject CSS ──
    _inject_analysis_cal_css(kp, cal_year, cal_month, today, daily_count)

    # ── Calendar grid ──
    cal_obj = cal_module.Calendar(firstweekday=6)
    weeks = cal_obj.monthdayscalendar(cal_year, cal_month)

    for week in weeks:
        cols = st.columns(7, gap="small")
        for col_idx, day_num in enumerate(week):
            with cols[col_idx]:
                if day_num == 0:
                    st.markdown('<div style="min-height:80px;"></div>', unsafe_allow_html=True)
                else:
                    date_key = f"{cal_year}-{cal_month:02d}-{day_num:02d}"
                    count = daily_count.get(date_key, 0)
                    container_key = f"{kp}_d_{day_num}"

                    with st.container(key=container_key):
                        if count > 0:
                            # Show score as button label if available
                            day_scores = [s for a in daily_analyses[date_key] if (s := _extract_score(a.analysis_text)) is not None]
                            if day_scores:
                                avg_day = sum(day_scores) / len(day_scores)
                                btn_label = f"{avg_day:.1f}/10"
                            else:
                                btn_label = f"{count}"

                            if st.button(btn_label, key=f"{kp}_btn_{day_num}", use_container_width=True):
                                _show_analysis_day_dialog(date_key, daily_analyses[date_key], user_id)
                        else:
                            st.button(str(day_num), key=f"{kp}_btn_{day_num}", use_container_width=True, disabled=True)

    # ── Legend ──
    legend_html = (
        '<div style="display:flex; gap:20px; justify-content:center; padding:12px 0; flex-wrap:wrap;">'
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<div style="width:12px; height:12px; border-radius:3px; background:rgba(232,101,26,0.3); '
        'border:1px solid #e8651a;"></div>'
        '<span style="color:#888; font-size:0.75rem;">Has Analyses</span></div>'
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<div style="width:12px; height:12px; border-radius:3px; border:2px solid #e8651a; '
        'box-shadow:0 0 6px rgba(232,101,26,0.5);"></div>'
        '<span style="color:#888; font-size:0.75rem;">Today</span></div>'
        '</div>'
    )
    st.markdown(legend_html, unsafe_allow_html=True)
