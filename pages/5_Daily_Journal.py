import streamlit as st
from datetime import date, timedelta

from lib.database import get_journal, upsert_journal, get_trades_for_date
from lib.models import DailyJournal
from lib.psychology_framework import (
    MENTAL_STATE_CATEGORIES,
    EMOTIONAL_STATES,
    MISTAKES_BY_CATEGORY,
    ICT_SETUPS,
    MARKET_CONDITIONS,
    assess_readiness,
)
from lib.auth import get_current_user_id

# ── Live price ticker ──
try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("Daily Journal")

user_id = get_current_user_id()

# --- Date Navigation ---
nav_col1, nav_col2, nav_col3, nav_col4 = st.columns([1, 1, 2, 1])

if "journal_date" not in st.session_state:
    st.session_state.journal_date = date.today()

with nav_col1:
    if st.button("< Prev", use_container_width=True):
        st.session_state.journal_date -= timedelta(days=1)
        st.rerun()

with nav_col2:
    if st.button("Today", type="primary", use_container_width=True):
        st.session_state.journal_date = date.today()
        st.rerun()

with nav_col3:
    selected_date = st.date_input(
        "Date",
        value=st.session_state.journal_date,
        label_visibility="collapsed",
        key="journal_date_picker",
    )
    if selected_date != st.session_state.journal_date:
        st.session_state.journal_date = selected_date
        st.rerun()

with nav_col4:
    if st.button("Next >", use_container_width=True):
        st.session_state.journal_date += timedelta(days=1)
        st.rerun()

current_date = st.session_state.journal_date
date_str = current_date.strftime("%Y-%m-%d")
display_date = current_date.strftime("%A, %B %d, %Y")
st.caption(display_date)

# --- Load existing entry ---
existing = get_journal(date_str, user_id=user_id)

# --- Daily P&L Summary ---
day_trades = get_trades_for_date(date_str, user_id=user_id)
if day_trades:
    total_pips = sum(t.pnl_pips for t in day_trades)
    wins = sum(1 for t in day_trades if t.pnl_pips > 0)
    losses = sum(1 for t in day_trades if t.pnl_pips < 0)

    pnl_col1, pnl_col2, pnl_col3 = st.columns(3)
    pnl_col1.metric("Today's P&L", f"{total_pips:+.1f} pips")
    pnl_col2.metric("Trades", len(day_trades))
    pnl_col3.metric("W / L", f"{wins} / {losses}")
else:
    st.caption("No trades logged for this date.")

st.divider()

# ============================================================
# MENTAL STATE ASSESSMENT
# ============================================================
st.subheader("Mental State Assessment")

# Helper to parse existing comma-separated values
def parse_csv(s: str) -> list[str]:
    if not s:
        return []
    return [x.strip() for x in s.split(",") if x.strip()]

mental_cols = st.columns(3)
mental_scores = {}

categories_list = list(MENTAL_STATE_CATEGORIES.items())
for i, (key, info) in enumerate(categories_list):
    col = mental_cols[i % 3]
    default_val = getattr(existing, key, 5) if existing else 5
    with col:
        val = st.slider(
            info["label"],
            min_value=1,
            max_value=10,
            value=default_val,
            help=info["description"],
            key=f"mental_{key}",
        )
        mental_scores[key] = val

# Readiness
readiness_score, readiness_label, readiness_reasoning = assess_readiness(mental_scores)

# Color the readiness
if readiness_score >= 7:
    color = "#ff7e33"  # green
elif readiness_score >= 4:
    color = "#e8651a"  # fire orange
else:
    color = "#9e4a15"  # red

st.markdown(
    f'<div style="padding: 12px; border-left: 4px solid {color}; background: #141414; border-radius: 4px;">'
    f'<strong style="color: {color};">Trading Readiness: {readiness_score}/10 — {readiness_label}</strong><br>'
    f'<span style="color: #a0a0a0; font-size: 0.85rem;">{readiness_reasoning}</span></div>',
    unsafe_allow_html=True,
)

st.divider()

# ============================================================
# ICT SETUPS USED TODAY
# ============================================================
st.subheader("ICT Setups Used Today")

existing_setups = parse_csv(existing.ict_setups_used) if existing else []
selected_setups = st.multiselect(
    "Select setups you used",
    options=ICT_SETUPS,
    default=[s for s in existing_setups if s in ICT_SETUPS],
    key="ict_setups",
    label_visibility="collapsed",
)

st.divider()

# ============================================================
# MARKET & EMOTIONS
# ============================================================
st.subheader("Market & Emotions")

market_emo_col1, market_emo_col2 = st.columns(2)

with market_emo_col1:
    st.markdown("**Market Conditions**")
    existing_market = existing.market_condition if existing else ""
    market_idx = 0
    if existing_market in MARKET_CONDITIONS:
        market_idx = MARKET_CONDITIONS.index(existing_market)
    market_condition = st.selectbox(
        "Market condition",
        options=MARKET_CONDITIONS,
        index=market_idx,
        key="market_cond",
        label_visibility="collapsed",
    )

with market_emo_col2:
    st.markdown("**Emotional State**")
    existing_emotions = parse_csv(existing.emotional_states) if existing else []
    selected_emotions = st.multiselect(
        "Emotional states",
        options=EMOTIONAL_STATES,
        default=[e for e in existing_emotions if e in EMOTIONAL_STATES],
        key="emotions",
        label_visibility="collapsed",
    )

st.divider()

# ============================================================
# MISTAKES MADE
# ============================================================
st.subheader("Mistakes Made")

existing_mistakes = parse_csv(existing.mistakes) if existing else []

# Show by category with expanders
all_selected_mistakes = []
for category, mistakes in MISTAKES_BY_CATEGORY.items():
    with st.expander(f"**{category}**", expanded=False):
        for mistake in mistakes:
            checked = mistake in existing_mistakes
            if st.checkbox(mistake, value=checked, key=f"mistake_{mistake}"):
                all_selected_mistakes.append(mistake)

st.divider()

# ============================================================
# DAILY REFLECTION
# ============================================================
st.subheader("Daily Reflection")

reflection = st.text_area(
    "What happened today? How did you feel about your trading?",
    value=existing.reflection if existing else "",
    height=120,
    key="reflection",
    label_visibility="collapsed",
    placeholder="What happened today? How did you feel about your trading?",
)

st.divider()

# ============================================================
# LESSONS & IMPROVEMENTS
# ============================================================
st.subheader("Lessons & Improvements")

lesson_col1, lesson_col2 = st.columns(2)

with lesson_col1:
    st.markdown("**Lessons Learned**")
    lessons = st.text_area(
        "What did you learn today?",
        value=existing.lessons_learned if existing else "",
        height=100,
        key="lessons",
        label_visibility="collapsed",
        placeholder="What did you learn today?",
    )

with lesson_col2:
    st.markdown("**Tomorrow's Improvements**")
    improvements = st.text_area(
        "Specific, actionable goals for tomorrow",
        value=existing.tomorrows_improvements if existing else "",
        height=100,
        key="improvements",
        label_visibility="collapsed",
        placeholder="Specific, actionable goals for tomorrow",
    )

st.divider()

# ============================================================
# SAVE
# ============================================================
if st.button("Save Journal Entry", type="primary", use_container_width=True):
    journal = DailyJournal(
        journal_date=date_str,
        sleep=mental_scores["sleep"],
        energy=mental_scores["energy"],
        focus=mental_scores["focus"],
        mood=mental_scores["mood"],
        stress=mental_scores["stress"],
        confidence=mental_scores["confidence"],
        readiness_score=readiness_score,
        readiness_label=readiness_label,
        emotional_states=",".join(selected_emotions),
        ict_setups_used=",".join(selected_setups),
        market_condition=market_condition,
        mistakes=",".join(all_selected_mistakes),
        reflection=reflection,
        lessons_learned=lessons,
        tomorrows_improvements=improvements,
    )
    upsert_journal(journal, user_id=user_id)
    st.success("Journal entry saved!")
