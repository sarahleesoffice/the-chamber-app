import streamlit as st
from datetime import date

from lib.auth import get_current_user_id
from lib.database import get_journal
from lib.psychology_framework import assess_readiness

user_id = get_current_user_id()

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("Pre-Trade Checklist")
st.caption("Complete this before every trading session. No trade without a green light.")

today_str = date.today().strftime("%Y-%m-%d")

# ============================================================
# READINESS CHECK
# ============================================================
st.subheader("1. Mental Readiness")

journal = get_journal(today_str, user_id=user_id)
if journal:
    scores = {
        "sleep": journal.sleep,
        "energy": journal.energy,
        "focus": journal.focus,
        "mood": journal.mood,
        "stress": journal.stress,
        "confidence": journal.confidence,
    }
    readiness, label, reasoning = assess_readiness(scores)

    if readiness >= 7:
        color = "#22c55e"
    elif readiness >= 4:
        color = "#e8651a"
    else:
        color = "#ef4444"

    st.markdown(
        f'<div style="padding:12px; border-left:4px solid {color}; background:#141414; border-radius:4px;">'
        f'<strong style="color:{color};">Readiness: {readiness}/10 — {label}</strong><br>'
        f'<span style="color:#a0a0a0; font-size:0.85rem;">{reasoning}</span></div>',
        unsafe_allow_html=True,
    )
else:
    st.warning("Fill out today's **Daily Journal** first to get your readiness score.")

st.divider()

# ============================================================
# SESSION PREP CHECKLIST
# ============================================================
st.subheader("2. Session Prep")

prep_items = [
    ("Reviewed higher timeframe bias (Daily/4H)", "What direction is the HTF pointing?"),
    ("Identified key levels (liquidity pools, OBs, FVGs)", "Where is resting liquidity? Where are unfilled FVGs?"),
    ("Marked kill zone times", "London 2-5 AM, NY 7-10 AM, London Close 10-12 PM EST"),
    ("Checked economic calendar", "Any high-impact news events during session?"),
    ("Determined session narrative (Power of 3)", "Is this accumulation, manipulation, or distribution?"),
    ("Set max loss for the day", "How many pips/% will you stop trading for the day?"),
]

prep_complete = 0
for item, help_text in prep_items:
    if st.checkbox(item, key=f"prep_{item}", help=help_text):
        prep_complete += 1

prep_pct = prep_complete / len(prep_items) * 100
st.progress(prep_pct / 100)
st.caption(f"{prep_complete}/{len(prep_items)} prep items complete")

st.divider()

# ============================================================
# TRADE PLAN
# ============================================================
st.subheader("3. Trade Plan")

plan_col1, plan_col2 = st.columns(2)

with plan_col1:
    st.markdown("**Bias**")
    bias = st.radio("Session bias", ["Bullish", "Bearish", "Neutral / No Trade"], key="bias", label_visibility="collapsed")

    st.markdown("**Target Pairs**")
    pairs = st.text_input("Which pairs are you watching?", placeholder="NAS100, EUR/USD, GBP/USD", key="target_pairs")

with plan_col2:
    st.markdown("**Setup Type**")
    setup = st.multiselect(
        "What setups are you looking for?",
        ["Order Block", "FVG Fill", "Liquidity Sweep", "OTE", "Silver Bullet", "MSS/BOS", "Breaker", "Macro Entry"],
        key="planned_setups",
        label_visibility="collapsed",
    )

    st.markdown("**Risk Per Trade**")
    risk = st.text_input("Max risk per trade", placeholder="e.g. 1% or 20 pips", key="risk_per")

st.divider()

# ============================================================
# RULES REMINDER
# ============================================================
st.subheader("4. Rules")

rules = [
    "Only trade during kill zones",
    "Wait for displacement — no chasing",
    "Minimum 2:1 risk-reward ratio",
    "Stop loss behind structure (OB, liquidity level)",
    "No revenge trades — walk away after 2 consecutive losses",
    "Follow the plan above — no improvisations",
]

rules_checked = 0
for rule in rules:
    if st.checkbox(rule, key=f"rule_{rule}"):
        rules_checked += 1

st.divider()

# ============================================================
# GO / NO-GO
# ============================================================
all_prep = prep_complete == len(prep_items)
all_rules = rules_checked == len(rules)
has_readiness = journal and readiness >= 4 if journal else False
has_plan = bias != "Neutral / No Trade" and pairs

if all_prep and all_rules and has_readiness and has_plan:
    st.markdown(
        '<div style="text-align:center; padding:20px; background:rgba(34,197,94,0.1); '
        'border:2px solid #22c55e; border-radius:8px;">'
        '<div style="font-size:2rem;">&#x2705;</div>'
        '<div style="color:#22c55e; font-size:1.3rem; font-weight:700;">GO — Ready to Trade</div>'
        '<div style="color:#a0a0a0; font-size:0.85rem;">Stick to the plan. Execute with discipline.</div>'
        '</div>',
        unsafe_allow_html=True,
    )
elif has_readiness and (all_prep or all_rules):
    st.markdown(
        '<div style="text-align:center; padding:20px; background:rgba(232,101,26,0.1); '
        'border:2px solid #e8651a; border-radius:8px;">'
        '<div style="font-size:2rem;">&#x26A0;</div>'
        '<div style="color:#e8651a; font-size:1.3rem; font-weight:700;">CAUTION — Almost Ready</div>'
        '<div style="color:#a0a0a0; font-size:0.85rem;">Complete all checklist items before trading.</div>'
        '</div>',
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        '<div style="text-align:center; padding:20px; background:rgba(239,68,68,0.1); '
        'border:2px solid #ef4444; border-radius:8px;">'
        '<div style="font-size:2rem;">&#x1F6D1;</div>'
        '<div style="color:#ef4444; font-size:1.3rem; font-weight:700;">NO-GO — Not Ready</div>'
        '<div style="color:#a0a0a0; font-size:0.85rem;">Complete your prep, journal, and checklist before opening any trades.</div>'
        '</div>',
        unsafe_allow_html=True,
    )
