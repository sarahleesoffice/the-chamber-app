import streamlit as st

from lib.auth import get_current_user_id
from lib.csv_import import detect_and_parse, parse_generic_csv
from lib.database import insert_trade, get_trade_count, delete_all_trades

user_id = get_current_user_id()

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("Import Trades")
st.caption("Import trade history from MT4, MT5, Tradovate, or any CSV file.")

# ============================================================
# UPLOAD
# ============================================================

existing_count = get_trade_count(user_id=user_id)
st.info(f"You currently have **{existing_count}** trades in the database.")

# Delete all trades option
if existing_count > 0:
    with st.expander("🗑️ Delete All Trades"):
        st.warning(f"This will permanently delete all **{existing_count}** trades. This cannot be undone.")
        confirm = st.text_input(
            f'Type **DELETE** to confirm:',
            key="delete_confirm",
            placeholder="DELETE",
        )
        if st.button("Delete All Trades", type="primary", key="delete_all_btn"):
            if confirm == "DELETE":
                deleted = delete_all_trades(user_id=user_id)
                st.success(f"Deleted **{deleted}** trades.")
                st.rerun()
            else:
                st.error("Type DELETE to confirm.")

uploaded = st.file_uploader(
    "Upload your trade history",
    type=["csv", "txt", "tsv", "xlsx"],
    help="Supports MetaTrader 4, MetaTrader 5, Tradovate, Excel (.xlsx), and generic CSV. "
         "**Apple Numbers:** export as CSV (File → Export To → CSV) or Excel (.xlsx).",
)

if uploaded:
    # Handle Excel files (.xlsx)
    if uploaded.name.endswith(".xlsx"):
        try:
            import pandas as pd
            df = pd.read_excel(uploaded, engine="openpyxl")
            text = df.to_csv(index=False)
        except Exception as e:
            st.error(f"Error reading Excel file: {e}")
            st.stop()
    else:
        text = uploaded.read().decode("utf-8", errors="replace")

    st.divider()

    # Auto-detect format
    fmt, trades = detect_and_parse(text)

    if fmt == "Unknown" or not trades:
        st.warning("Could not auto-detect the format. Try mapping columns manually below.")

        # Show raw header preview
        lines = text.strip().split("\n")
        if lines:
            st.code(lines[0], language="text")
            st.caption("First row shown above — these are your column headers.")

        # Manual mapping
        st.subheader("Manual Column Mapping")
        st.markdown("Map your CSV columns to the required fields.")

        import csv, io
        reader = csv.reader(io.StringIO(text))
        try:
            headers = [h.strip() for h in next(reader)]
        except StopIteration:
            st.error("Empty file.")
            st.stop()

        mc1, mc2 = st.columns(2)
        with mc1:
            pair_col = st.selectbox("Pair / Symbol column", headers, key="map_pair")
            direction_col = st.selectbox("Direction / Type column", headers, key="map_dir")
            entry_col = st.selectbox("Entry Price column", headers, key="map_entry")
            exit_col = st.selectbox("Exit Price column", headers, key="map_exit")
        with mc2:
            date_col = st.selectbox("Date column", headers, key="map_date")
            pnl_col = st.selectbox("PnL Pips column (optional)", ["(none)"] + headers, key="map_pnl")
            dollar_col = st.selectbox("PnL Dollar column (optional)", ["(none)"] + headers, key="map_dollar")
            notes_col = st.selectbox("Notes column (optional)", ["(none)"] + headers, key="map_notes")

        if st.button("Parse with mapping", type="primary"):
            kwargs = {
                "pair_col": pair_col,
                "direction_col": direction_col,
                "entry_col": entry_col,
                "exit_col": exit_col,
                "date_col": date_col,
            }
            if pnl_col != "(none)":
                kwargs["pnl_col"] = pnl_col
            if dollar_col != "(none)":
                kwargs["dollar_col"] = dollar_col
            if notes_col != "(none)":
                kwargs["notes_col"] = notes_col

            trades = parse_generic_csv(text, **kwargs)

            if trades:
                st.session_state["import_preview"] = trades
                st.session_state["import_fmt"] = "Manual Mapping"
            else:
                st.error("No trades parsed. Check your column mapping.")

    else:
        st.success(f"Detected format: **{fmt}** — Found **{len(trades)}** trades")
        st.session_state["import_preview"] = trades
        st.session_state["import_fmt"] = fmt

# ============================================================
# PREVIEW
# ============================================================

if "import_preview" in st.session_state and st.session_state["import_preview"]:
    trades = st.session_state["import_preview"]
    fmt = st.session_state.get("import_fmt", "")

    st.divider()
    st.subheader(f"Preview — {len(trades)} trades")

    # Summary
    wins = sum(1 for t in trades if t.pnl_pips > 0)
    losses = sum(1 for t in trades if t.pnl_pips < 0)
    total_pips = sum(t.pnl_pips for t in trades)
    total_dollar = sum(t.pnl_dollar for t in trades if t.pnl_dollar)

    sc1, sc2, sc3, sc4 = st.columns(4)
    sc1.metric("Wins", wins)
    sc2.metric("Losses", losses)
    sc3.metric("Total Pips", f"{total_pips:+.1f}")
    sc4.metric("Total P&L", f"${total_dollar:+.2f}" if total_dollar else "—")

    st.divider()

    # Show first 20 trades as a table
    preview_data = []
    for t in trades[:20]:
        preview_data.append({
            "Date": t.trade_date,
            "Pair": t.pair,
            "Dir": t.direction.upper(),
            "Entry": t.entry_price,
            "Exit": t.exit_price,
            "Pips": f"{t.pnl_pips:+.1f}",
            "P&L $": f"${t.pnl_dollar:+.2f}" if t.pnl_dollar else "—",
        })

    st.dataframe(preview_data, use_container_width=True, hide_index=True)

    if len(trades) > 20:
        st.caption(f"Showing first 20 of {len(trades)} trades.")

    st.divider()

    # Import button
    ic1, ic2 = st.columns(2)
    with ic1:
        if st.button(f"Import All {len(trades)} Trades", type="primary", key="import_all"):
            imported = 0
            progress = st.progress(0)
            for i, trade in enumerate(trades):
                insert_trade(trade, user_id=user_id)
                imported += 1
                progress.progress((i + 1) / len(trades))

            st.success(f"Imported **{imported}** trades!")
            del st.session_state["import_preview"]
            st.rerun()

    with ic2:
        if st.button("Cancel", key="import_cancel"):
            del st.session_state["import_preview"]
            st.rerun()

# ============================================================
# TEMPLATE DOWNLOAD
# ============================================================
st.divider()
st.subheader("CSV Template")
st.markdown("If your broker doesn't export in MT4/MT5/Tradovate format, use this template:")

template = """pair,direction,entry_price,exit_price,pnl_pips,pnl_dollar,trade_date,reasoning
EUR/USD,long,1.08500,1.08750,25.0,250.00,2025-01-15,OB entry at London open
NAS100,short,21500.0,21450.0,50.0,500.00,2025-01-16,FVG fill in premium zone"""

st.code(template, language="csv")
st.download_button(
    "Download Template CSV",
    data=template,
    file_name="trade_import_template.csv",
    mime="text/csv",
)
