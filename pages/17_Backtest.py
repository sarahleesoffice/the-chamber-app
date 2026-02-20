from datetime import date, timedelta

import streamlit as st

from lib.backtesting import run_backtest

st.header("Backtesting Engine")

st.markdown(
    """
    <style>
    .stApp { background-color: #0a0a0a; }
    .bt-card {
        background: #141414;
        border: 1px solid #1e1a17;
        border-radius: 14px;
        padding: 1rem;
    }
    .bt-accent { color: #e8651a; font-weight: 700; }
    </style>
    """,
    unsafe_allow_html=True,
)

with st.container(border=True):
    col1, col2, col3 = st.columns(3)
    with col1:
        pair = st.selectbox("Pair", ["EUR/USD", "GBP/USD", "USD/JPY", "XAU/USD", "NAS100", "MNQ"])
    with col2:
        strategy = st.selectbox("Strategy", ["OB+FVG", "MSS+OTE", "Silver Bullet"])
    with col3:
        initial_equity = st.number_input("Initial Equity", min_value=100.0, value=10000.0, step=500.0)

    col4, col5, col6 = st.columns(3)
    with col4:
        start_date = st.date_input("Start Date", value=date.today() - timedelta(days=365))
    with col5:
        end_date = st.date_input("End Date", value=date.today())
    with col6:
        risk_pct = st.slider("Risk / Trade (%)", min_value=0.25, max_value=5.0, value=1.0, step=0.25)

    run_bt = st.button("Run Backtest", type="primary", use_container_width=True)

if run_bt:
    if start_date >= end_date:
        st.error("Start date must be before end date.")
    else:
        with st.spinner("Running backtest..."):
            try:
                result = run_backtest(
                    pair=pair,
                    start_date=start_date.isoformat(),
                    end_date=end_date.isoformat(),
                    strategy=strategy,
                    initial_equity=float(initial_equity),
                    risk_per_trade_pct=float(risk_pct),
                )
            except Exception as e:
                st.error(f"Backtest failed: {e}")
                st.stop()

        st.subheader("Results")
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Win Rate", f"{result.win_rate:.1f}%")
        m2.metric("Max Drawdown", f"{result.max_drawdown:.2f}%")
        m3.metric("Profit Factor", "∞" if result.profit_factor == float("inf") else f"{result.profit_factor:.2f}")
        m4.metric("Total Return", f"{result.total_return_pct:+.2f}%")

        st.markdown("### Equity Curve")
        if not result.equity_curve.empty:
            st.line_chart(result.equity_curve["equity"])
        else:
            st.info("No equity data generated.")

        st.markdown("### Trade Log")
        if result.trades.empty:
            st.warning("No trades triggered for this pair/date/strategy.")
        else:
            show = result.trades.copy()
            show["timestamp"] = show["timestamp"].astype(str)
            st.dataframe(show, use_container_width=True)
