import streamlit as st
import os

from lib.database import get_all_trades, get_distinct_pairs, get_trade_count, delete_trade
from lib.chart_storage import get_chart_absolute_path
from lib.auth import get_current_user_id

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("Trade History")

user_id = get_current_user_id()

# Summary metrics
trades = get_all_trades(limit=1000, user_id=user_id)

if not trades:
    st.info("No trades recorded yet. Go to **Enter Trade** to log your first trade.")
    st.stop()

# Calculate stats
total = len(trades)
winners = [t for t in trades if t.pnl_pips > 0]
losers = [t for t in trades if t.pnl_pips < 0]
breakeven = [t for t in trades if t.pnl_pips == 0]
win_rate = (len(winners) / total * 100) if total > 0 else 0
avg_pips = sum(t.pnl_pips for t in trades) / total if total > 0 else 0
total_pips = sum(t.pnl_pips for t in trades)
best = max(trades, key=lambda t: t.pnl_pips) if trades else None
worst = min(trades, key=lambda t: t.pnl_pips) if trades else None

col1, col2, col3, col4 = st.columns(4)
col1.metric("Total Trades", total)
col2.metric("Win Rate", f"{win_rate:.1f}%")
col3.metric("Total Pips", f"{total_pips:+.1f}")
col4.metric("Avg Pips/Trade", f"{avg_pips:+.1f}")

# Filters
st.divider()

filter_col1, filter_col2, filter_col3 = st.columns(3)

with filter_col1:
    pair_filter = st.multiselect("Filter by Pair", get_distinct_pairs(user_id=user_id))

with filter_col2:
    direction_filter = st.selectbox("Direction", ["All", "Long", "Short"])

with filter_col3:
    result_filter = st.selectbox("Result", ["All", "Winners", "Losers"])

# Apply filters
filtered = trades
if pair_filter:
    filtered = [t for t in filtered if t.pair in pair_filter]
if direction_filter != "All":
    filtered = [t for t in filtered if t.direction == direction_filter.lower()]
if result_filter == "Winners":
    filtered = [t for t in filtered if t.pnl_pips > 0]
elif result_filter == "Losers":
    filtered = [t for t in filtered if t.pnl_pips < 0]

st.caption(f"Showing {len(filtered)} trade{'s' if len(filtered) != 1 else ''}")

# Pagination
TRADES_PER_PAGE = 10
if "history_page" not in st.session_state:
    st.session_state.history_page = 0

total_pages = max(1, (len(filtered) + TRADES_PER_PAGE - 1) // TRADES_PER_PAGE)
st.session_state.history_page = min(st.session_state.history_page, total_pages - 1)

start = st.session_state.history_page * TRADES_PER_PAGE
page_trades = filtered[start:start + TRADES_PER_PAGE]

# Trade list
for trade in page_trades:
    pnl_color = "green" if trade.pnl_pips > 0 else "red" if trade.pnl_pips < 0 else "gray"
    arrow = "^" if trade.direction == "long" else "v"
    header = f"{trade.pair} {arrow} {trade.direction.upper()} | **:{pnl_color}[{trade.pnl_pips:+.1f} pips]** | {trade.trade_date}"

    with st.expander(header):
        detail_col1, detail_col2 = st.columns(2)

        with detail_col1:
            st.write(f"**Entry:** {trade.entry_price}")
            st.write(f"**Exit:** {trade.exit_price}")
            st.write(f"**P/L:** {trade.pnl_pips:+.1f} pips")
            st.write(f"**Date:** {trade.trade_date}")
            st.write(f"**Recorded:** {trade.created_at}")

            if trade.reasoning:
                st.write("**Reasoning:**")
                st.write(trade.reasoning)

        with detail_col2:
            if trade.chart_path:
                abs_path = get_chart_absolute_path(trade.chart_path)
                if os.path.exists(abs_path):
                    st.image(abs_path, caption="Trade Chart", use_container_width=True)
                else:
                    st.warning("Chart file not found.")
            else:
                st.info("No chart uploaded for this trade.")

        if st.button(f"Delete Trade #{trade.id}", key=f"del_{trade.id}", type="secondary"):
            delete_trade(trade.id, user_id=user_id)
            st.rerun()

# Pagination controls
if total_pages > 1:
    st.divider()
    nav_col1, nav_col2, nav_col3 = st.columns([1, 2, 1])
    with nav_col1:
        if st.button("Previous", disabled=st.session_state.history_page == 0):
            st.session_state.history_page -= 1
            st.rerun()
    with nav_col2:
        st.caption(f"Page {st.session_state.history_page + 1} of {total_pages}")
    with nav_col3:
        if st.button("Next", disabled=st.session_state.history_page >= total_pages - 1):
            st.session_state.history_page += 1
            st.rerun()
