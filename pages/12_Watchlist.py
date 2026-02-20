import streamlit as st

from lib.auth import get_current_user_id
from lib.database import (
    get_all_watchlist,
    insert_watchlist_item,
    update_watchlist_item,
    delete_watchlist_item,
)
from lib.models import WatchlistItem
from lib.psychology_framework import ICT_SETUPS

user_id = get_current_user_id()

st.header("Watchlist")
st.caption("Track pairs, levels, and setups you're watching for.")

BIAS_OPTIONS = ["bullish", "bearish", "neutral"]
TIMEFRAMES = ["Monthly", "Weekly", "Daily", "4H", "1H", "15m", "5m", "1m"]

# ============================================================
# ADD NEW ITEM
# ============================================================

with st.expander("**+ Add to Watchlist**", expanded=False):
    ac1, ac2 = st.columns(2)
    with ac1:
        new_pair = st.text_input("Pair / Instrument", placeholder="e.g. NAS100, EUR/USD", key="wl_pair")
        new_bias = st.selectbox("Bias", BIAS_OPTIONS, key="wl_bias")
        new_tf = st.selectbox("Primary Timeframe", TIMEFRAMES, index=3, key="wl_tf")
    with ac2:
        new_setup = st.selectbox("Setup Watching For", ["(any)"] + ICT_SETUPS, key="wl_setup")
        new_alert = st.number_input("Alert Price (optional)", value=0.0, format="%.5f", key="wl_alert")
        new_levels = st.text_input(
            "Key Levels (comma-separated)",
            placeholder="e.g. 21500, 21350, 21200",
            key="wl_levels",
        )

    new_notes = st.text_area(
        "Trade Plan / Notes",
        placeholder="What are you watching for? What would make you take this trade?",
        key="wl_notes",
        height=80,
    )

    if st.button("Add to Watchlist", type="primary", key="wl_add"):
        if new_pair:
            item = WatchlistItem(
                pair=new_pair.upper(),
                bias=new_bias,
                timeframe=new_tf,
                key_levels=new_levels,
                notes=new_notes,
                setup_type=new_setup if new_setup != "(any)" else "",
                alert_price=new_alert if new_alert != 0.0 else None,
            )
            insert_watchlist_item(item, user_id=user_id)
            st.success(f"Added {new_pair.upper()} to watchlist!")
            st.rerun()
        else:
            st.warning("Pair is required.")

# ============================================================
# CURRENT WATCHLIST
# ============================================================

st.divider()

items = get_all_watchlist(active_only=True, user_id=user_id)
archived = get_all_watchlist(active_only=False, user_id=user_id)
archived_count = len(archived) - len(items)

if not items:
    st.info("Your watchlist is empty. Add pairs above to start tracking setups.")
else:
    # Bias color map
    bias_colors = {
        "bullish": "#22c55e",
        "bearish": "#ef4444",
        "neutral": "#a0a0a0",
    }

    # Group by bias
    bullish = [i for i in items if i.bias == "bullish"]
    bearish = [i for i in items if i.bias == "bearish"]
    neutral = [i for i in items if i.bias == "neutral"]

    # Summary
    sc1, sc2, sc3, sc4 = st.columns(4)
    sc1.metric("Watching", len(items))
    sc2.metric("Bullish", len(bullish))
    sc3.metric("Bearish", len(bearish))
    sc4.metric("Neutral", len(neutral))

    st.divider()

    for item in items:
        color = bias_colors.get(item.bias, "#a0a0a0")
        bias_label = item.bias.upper()
        setup_label = f" — {item.setup_type}" if item.setup_type else ""

        with st.expander(
            f"**{item.pair}** "
            f'<span style="color:{color}; font-size:0.8rem;">({bias_label})</span>'
            f" {item.timeframe}{setup_label}",
        ):
            # Info
            ic1, ic2, ic3 = st.columns(3)
            ic1.markdown(f"**Bias:** <span style='color:{color};'>{bias_label}</span>", unsafe_allow_html=True)
            ic2.markdown(f"**Timeframe:** {item.timeframe}")
            ic3.markdown(f"**Setup:** {item.setup_type or 'Any'}")

            if item.key_levels:
                st.markdown(f"**Key Levels:** `{item.key_levels}`")

            if item.alert_price:
                st.markdown(f"**Alert Price:** `{item.alert_price}`")

            if item.notes:
                st.markdown(f"**Plan:** {item.notes}")

            st.caption(f"Added: {item.created_at} | Updated: {item.updated_at}")

            # Actions
            bc1, bc2 = st.columns(2)
            with bc1:
                if st.button("Archive", key=f"arch_{item.id}"):
                    item.active = False
                    update_watchlist_item(item, user_id=user_id)
                    st.rerun()
            with bc2:
                if st.button("Remove", key=f"del_{item.id}", type="secondary"):
                    delete_watchlist_item(item.id, user_id=user_id)
                    st.rerun()

# Archived items
if archived_count > 0:
    st.divider()
    with st.expander(f"Archived ({archived_count})"):
        for item in get_all_watchlist(active_only=False, user_id=user_id):
            if item.active:
                continue
            ic1, ic2, ic3 = st.columns([3, 1, 1])
            with ic1:
                st.markdown(f"**{item.pair}** — {item.bias} ({item.timeframe})")
            with ic2:
                if st.button("Restore", key=f"restore_{item.id}"):
                    item.active = True
                    update_watchlist_item(item, user_id=user_id)
                    st.rerun()
            with ic3:
                if st.button("Delete", key=f"pdel_{item.id}"):
                    delete_watchlist_item(item.id, user_id=user_id)
                    st.rerun()
