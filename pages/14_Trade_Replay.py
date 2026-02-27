import streamlit as st

from lib.auth import get_current_user_id
from lib.database import (
    get_all_trades,
    get_trade,
    get_analyses_for_trade,
    get_grades_for_trade,
    get_journal,
    get_playbook,
)
from lib.chart_storage import load_chart

# ── Live price ticker ──
try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

user_id = get_current_user_id()

st.header("Trade Replay")
st.caption("Step through your trades and review everything in one place.")

# ============================================================
# TRADE SELECTOR
# ============================================================

trades = get_all_trades(limit=500, user_id=user_id)

if not trades:
    st.info("No trades to replay. Log some trades first.")
    st.stop()

# Filter options
fc1, fc2, fc3 = st.columns(3)
with fc1:
    pairs = sorted(set(t.pair for t in trades))
    filter_pair = st.selectbox("Filter by pair", ["All"] + pairs, key="replay_pair")
with fc2:
    filter_dir = st.selectbox("Filter by direction", ["All", "Long", "Short"], key="replay_dir")
with fc3:
    filter_result = st.selectbox("Filter by result", ["All", "Winners", "Losers"], key="replay_result")

# Apply filters
filtered = trades
if filter_pair != "All":
    filtered = [t for t in filtered if t.pair == filter_pair]
if filter_dir != "All":
    filtered = [t for t in filtered if t.direction == filter_dir.lower()]
if filter_result == "Winners":
    filtered = [t for t in filtered if t.pnl_pips > 0]
elif filter_result == "Losers":
    filtered = [t for t in filtered if t.pnl_pips < 0]

if not filtered:
    st.warning("No trades match your filters.")
    st.stop()

st.caption(f"{len(filtered)} trades")

# Navigation
if "replay_index" not in st.session_state:
    st.session_state.replay_index = 0

# Clamp index
if st.session_state.replay_index >= len(filtered):
    st.session_state.replay_index = len(filtered) - 1
if st.session_state.replay_index < 0:
    st.session_state.replay_index = 0

# Nav buttons
nc1, nc2, nc3, nc4 = st.columns([1, 1, 3, 1])
with nc1:
    if st.button("< Prev", disabled=st.session_state.replay_index == 0, key="replay_prev"):
        st.session_state.replay_index -= 1
        st.rerun()
with nc2:
    if st.button("Next >", disabled=st.session_state.replay_index >= len(filtered) - 1, key="replay_next"):
        st.session_state.replay_index += 1
        st.rerun()
with nc3:
    st.caption(f"Trade {st.session_state.replay_index + 1} of {len(filtered)}")
with nc4:
    jump_to = st.number_input(
        "Jump to #",
        min_value=1,
        max_value=len(filtered),
        value=st.session_state.replay_index + 1,
        key="replay_jump",
        label_visibility="collapsed",
    )
    if jump_to != st.session_state.replay_index + 1:
        st.session_state.replay_index = jump_to - 1
        st.rerun()

st.divider()

# ============================================================
# TRADE DISPLAY
# ============================================================

trade = filtered[st.session_state.replay_index]

# Header with result
pnl_color = "#ff7e33" if trade.pnl_pips > 0 else "#9e4a15" if trade.pnl_pips < 0 else "#a0a0a0"
result_label = "WIN" if trade.pnl_pips > 0 else "LOSS" if trade.pnl_pips < 0 else "BE"

st.markdown(
    f'<div style="padding:12px; border:1px solid {pnl_color}; border-radius:6px; margin-bottom:16px;">'
    f'<span style="font-size:1.4rem; font-weight:700;">{trade.pair}</span> '
    f'<span style="color:{pnl_color}; font-weight:700;">{trade.direction.upper()}</span> '
    f'<span style="color:{pnl_color}; font-size:1.2rem; font-weight:600;">{trade.pnl_pips:+.1f} pips — {result_label}</span>'
    f'<br><span style="color:#a0a0a0;">{trade.trade_date} | Entry: {trade.entry_price} → Exit: {trade.exit_price}</span>'
    f'{"<br><span style=color:#a0a0a0;>P&L: $" + f"{trade.pnl_dollar:+.2f}</span>" if trade.pnl_dollar else ""}'
    f'</div>',
    unsafe_allow_html=True,
)

# Two-column layout: chart + details
col_chart, col_details = st.columns([3, 2])

with col_chart:
    # Chart screenshot
    if trade.chart_path:
        chart_bytes, mime = load_chart(trade.chart_path)
        if chart_bytes:
            st.image(chart_bytes, caption="Trade Chart", use_container_width=True)
        else:
            st.info("Chart file not found.")
    else:
        st.markdown(
            '<div style="padding:40px; text-align:center; border:1px dashed #2a2a2a; border-radius:6px; color:#a0a0a0;">'
            'No chart screenshot for this trade</div>',
            unsafe_allow_html=True,
        )

with col_details:
    # Reasoning
    st.markdown("**Reasoning:**")
    if trade.reasoning:
        st.markdown(trade.reasoning)
    else:
        st.caption("No reasoning recorded.")

    st.divider()

    # Grade (if exists)
    grades = get_grades_for_trade(trade.id, user_id=user_id)
    if grades:
        for g in grades:
            pb = get_playbook(g.playbook_id, user_id=user_id)
            pb_name = pb.name if pb else f"Setup #{g.playbook_id}"
            compliance_color = "#ff7e33" if g.compliance_pct >= 80 else "#e8651a" if g.compliance_pct >= 50 else "#9e4a15"

            st.markdown(f"**Playbook Grade: {pb_name}**")
            st.progress(g.compliance_pct / 100)
            st.markdown(
                f'<span style="color:{compliance_color}; font-weight:600;">{g.compliance_pct:.0f}% Compliance</span>',
                unsafe_allow_html=True,
            )

            if g.rules_broken:
                broken = [r.strip() for r in g.rules_broken.split(",") if r.strip()]
                if broken:
                    st.markdown("**Broken rules:**")
                    for r in broken:
                        st.markdown(f"- {r}")

            if g.notes:
                st.caption(f"Notes: {g.notes}")
    else:
        st.caption("No playbook grade for this trade.")

    st.divider()

    # Journal for that day
    journal = get_journal(trade.trade_date, user_id=user_id)
    if journal:
        st.markdown(f"**Journal ({trade.trade_date}):**")
        st.markdown(
            f"Sleep: {journal.sleep}/10 | Energy: {journal.energy}/10 | "
            f"Focus: {journal.focus}/10 | Mood: {journal.mood}/10"
        )
        if journal.readiness_label:
            st.caption(f"Readiness: {journal.readiness_score}/10 — {journal.readiness_label}")
        if journal.mistakes:
            st.caption(f"Mistakes: {journal.mistakes}")
    else:
        st.caption("No journal entry for this date.")

# ============================================================
# AI ANALYSIS (if exists)
# ============================================================

st.divider()

analyses = get_analyses_for_trade(trade.id, user_id=user_id)
if analyses:
    st.subheader("AI Analysis")
    for analysis in analyses:
        with st.expander(f"**{analysis.provider}** ({analysis.model}) — {analysis.created_at}"):
            st.markdown(analysis.analysis_text)
else:
    st.caption("No AI analysis for this trade. Request one from the AI Analysis page.")

# ============================================================
# QUICK STATS FOR CURRENT FILTER
# ============================================================

st.divider()
st.subheader("Filter Stats")

total = len(filtered)
wins = sum(1 for t in filtered if t.pnl_pips > 0)
losses = sum(1 for t in filtered if t.pnl_pips < 0)
total_pips = sum(t.pnl_pips for t in filtered)
avg_win = sum(t.pnl_pips for t in filtered if t.pnl_pips > 0) / wins if wins else 0
avg_loss = sum(t.pnl_pips for t in filtered if t.pnl_pips < 0) / losses if losses else 0
win_rate = wins / total * 100 if total else 0

sc1, sc2, sc3, sc4, sc5 = st.columns(5)
sc1.metric("Win Rate", f"{win_rate:.0f}%")
sc2.metric("Total Pips", f"{total_pips:+.1f}")
sc3.metric("Avg Win", f"{avg_win:+.1f}")
sc4.metric("Avg Loss", f"{avg_loss:+.1f}")
sc5.metric("R:R", f"{abs(avg_win / avg_loss):.2f}" if avg_loss != 0 else "—")
