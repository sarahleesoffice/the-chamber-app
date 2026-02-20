import os
import streamlit as st

from lib.database import get_all_trades, get_analyses_for_trade, insert_analysis, get_trade
from lib.chart_storage import load_chart_bytes, get_chart_mime_type, get_chart_absolute_path
from lib.ai_providers import get_provider
from lib.knowledge.rag import build_rag_context
from lib.knowledge.vector_store import get_collection_stats
from lib.models import Analysis
from lib.auth import get_current_user_id, has_api_key

st.header("AI Analysis")

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

trades = get_all_trades(limit=200, user_id=user_id)
if not trades:
    st.info("No trades recorded yet. Go to **Enter Trade** to log your first trade.")
    st.stop()

tab_request, tab_history = st.tabs(["Request Analysis", "View Past Analyses"])

with tab_request:
    # Trade selector
    trade_options = {
        t.id: f"#{t.id} | {t.pair} {t.direction.upper()} | {t.pnl_pips:+.1f} pips | {t.trade_date}"
        for t in trades
    }
    selected_id = st.selectbox(
        "Select a trade to analyze",
        options=list(trade_options.keys()),
        format_func=lambda x: trade_options[x],
        key="analyze_trade_select",
    )

    trade = get_trade(selected_id, user_id=user_id)
    if trade:
        # Preview
        preview_col1, preview_col2 = st.columns(2)
        with preview_col1:
            st.write(f"**Pair:** {trade.pair}")
            st.write(f"**Direction:** {trade.direction.upper()}")
            st.write(f"**Entry:** {trade.entry_price}  |  **Exit:** {trade.exit_price}")
            st.write(f"**P/L:** {trade.pnl_pips:+.1f} pips")
            st.write(f"**Date:** {trade.trade_date}")
            if trade.reasoning:
                st.write("**Reasoning:**")
                st.write(trade.reasoning)
            else:
                st.caption("No reasoning provided for this trade.")

        with preview_col2:
            if trade.chart_path:
                abs_path = get_chart_absolute_path(trade.chart_path)
                if os.path.exists(abs_path):
                    st.image(abs_path, caption="Trade Chart", use_container_width=True)
            else:
                st.info("No chart uploaded for this trade.")

        st.divider()

        # Provider info from sidebar
        provider_name = st.session_state.get("ai_provider", "Claude")
        model_name = st.session_state.get("ai_model", "claude-sonnet-4-5-20250514")

        # Show knowledge base status
        kb_stats = get_collection_stats()
        if kb_stats["total_chunks"] > 0:
            st.caption(f"Using **{provider_name}** ({model_name}) + ICT Knowledge Base ({kb_stats['total_chunks']} chunks)")
        else:
            st.caption(f"Using **{provider_name}** ({model_name})")

        if st.button("Analyze Trade", type="primary", use_container_width=True):
            try:
                provider = get_provider(provider_name, model_name)
            except ValueError as e:
                st.error(str(e))
                st.stop()

            # Load chart if available
            chart_bytes = None
            chart_mime = None
            if trade.chart_path:
                try:
                    chart_bytes = load_chart_bytes(trade.chart_path)
                    chart_mime = get_chart_mime_type(trade.chart_path)
                except FileNotFoundError:
                    st.warning("Chart file not found. Analyzing without chart.")

            # Retrieve relevant ICT teachings via RAG
            rag_context = ""
            if kb_stats["total_chunks"] > 0:
                with st.spinner("Retrieving relevant ICT teachings..."):
                    try:
                        rag_context = build_rag_context(trade, n_results=5)
                    except Exception:
                        pass  # Gracefully fall back to no RAG

            with st.spinner(f"Analyzing your trade with {provider_name}..."):
                try:
                    result = provider.analyze_trade(trade, chart_bytes, chart_mime, rag_context=rag_context)
                except Exception as e:
                    st.error(f"Analysis failed: {e}")
                    st.stop()

            # Save analysis
            analysis = Analysis(
                trade_id=trade.id,
                provider=provider.get_provider_name(),
                model=provider.get_model_name(),
                analysis_text=result,
            )
            insert_analysis(analysis, user_id=user_id)

            # Display result
            st.success("Analysis complete!")
            st.markdown(result)

with tab_history:
    history_trade_options = {
        t.id: f"#{t.id} | {t.pair} {t.direction.upper()} | {t.pnl_pips:+.1f} pips | {t.trade_date}"
        for t in trades
    }
    history_selected_id = st.selectbox(
        "Select a trade",
        options=list(history_trade_options.keys()),
        format_func=lambda x: history_trade_options[x],
        key="history_trade_select",
    )

    analyses = get_analyses_for_trade(history_selected_id, user_id=user_id)

    if not analyses:
        st.info("No analyses yet for this trade. Use the **Request Analysis** tab to generate one.")
    else:
        st.caption(f"{len(analyses)} analysis{'es' if len(analyses) != 1 else ''} found")

        for i, analysis in enumerate(analyses):
            provider_badge = f"**{analysis.provider}** ({analysis.model})"
            with st.expander(f"{provider_badge} - {analysis.created_at}", expanded=(i == 0)):
                st.markdown(analysis.analysis_text)
