import streamlit as st
from datetime import date

from lib.models import Trade
from lib.database import insert_trade, update_trade_chart_path
from lib.trade_math import calculate_pnl_pips, get_common_pairs, format_pair
from lib.chart_storage import save_chart
from lib.auth import get_current_user_id

st.header("Enter Trade")

user_id = get_current_user_id()

col_left, col_right = st.columns(2, gap="large")

with col_left:
    pair_options = get_common_pairs() + ["Other"]
    pair_choice = st.selectbox("Currency Pair", pair_options)
    if pair_choice == "Other":
        pair_input = st.text_input("Enter pair (e.g. EUR/USD)")
        pair = format_pair(pair_input) if pair_input else ""
    else:
        pair = pair_choice

    direction = st.radio("Direction", ["long", "short"], horizontal=True,
                         format_func=lambda x: f"{'Long' if x == 'long' else 'Short'}")

    entry_price = st.number_input("Entry Price", min_value=0.0, value=0.0, format="%.5f", step=0.00001)
    exit_price = st.number_input("Exit Price", min_value=0.0, value=0.0, format="%.5f", step=0.00001)
    trade_date = st.date_input("Trade Date", value=date.today())

    # Real-time P/L calculation
    if entry_price > 0 and exit_price > 0 and pair:
        pnl = calculate_pnl_pips(pair, direction, entry_price, exit_price)
        st.metric("P/L (pips)", f"{pnl:+.1f}", delta=f"{pnl:+.1f} pips",
                  delta_color="normal")

with col_right:
    chart_file = st.file_uploader(
        "Upload TradingView Chart Screenshot",
        type=["jpg", "jpeg", "png", "webp"],
        help="Upload a screenshot of your chart showing the trade setup",
    )
    if chart_file:
        st.image(chart_file, caption="Chart Preview", use_container_width=True)

    reasoning = st.text_area(
        "Trade Reasoning",
        height=200,
        placeholder=(
            "Describe your reasoning using ICT concepts...\n\n"
            "Examples:\n"
            "- Bullish OB in discount zone after liquidity sweep below Asian low\n"
            "- FVG fill on the 15m after MSS on the 1H\n"
            "- OTE entry at 62% retracement after BOS during NY kill zone\n"
            "- Price swept previous day low, then displaced through bearish OB"
        ),
    )

st.divider()

if st.button("Save Trade", type="primary", use_container_width=True):
    # Validation
    errors = []
    if not pair:
        errors.append("Please select or enter a currency pair.")
    if entry_price <= 0:
        errors.append("Entry price must be positive.")
    if exit_price <= 0:
        errors.append("Exit price must be positive.")
    if entry_price > 0 and exit_price > 0 and entry_price == exit_price:
        errors.append("Entry and exit prices must be different.")
    if trade_date > date.today():
        errors.append("Trade date cannot be in the future.")

    if errors:
        for err in errors:
            st.error(err)
    else:
        pnl_pips = calculate_pnl_pips(pair, direction, entry_price, exit_price)

        trade = Trade(
            pair=pair,
            direction=direction,
            entry_price=entry_price,
            exit_price=exit_price,
            pnl_pips=pnl_pips,
            trade_date=trade_date.isoformat(),
            reasoning=reasoning,
        )

        trade_id = insert_trade(trade, user_id=user_id)

        # Save chart after we have the trade ID
        if chart_file:
            chart_file.seek(0)
            chart_path = save_chart(chart_file, trade_id, user_id=user_id)
            update_trade_chart_path(trade_id, chart_path, user_id=user_id)

        st.success(f"Trade saved! {pair} {direction.upper()} | {pnl_pips:+.1f} pips")
        st.balloons()
