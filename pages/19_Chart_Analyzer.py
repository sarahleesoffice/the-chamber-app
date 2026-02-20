import json

import streamlit as st

from lib.chart_annotator import analyze_chart_with_ai
from lib.auth import get_current_user_id, has_api_key

st.header("TradingView Chart Analyzer")
st.caption("Upload a chart screenshot and AI will detect ICT concepts.")

user_id = get_current_user_id()
provider_name = st.session_state.get("ai_provider", "Claude")
key_provider = "anthropic" if provider_name == "Claude" else "gemini"

if not has_api_key(user_id, key_provider):
    st.warning(f"You need a **{provider_name}** API key to use Chart Analyzer.")
    st.markdown(
        "**How to get started:**\n"
        "1. Go to **Settings** in the sidebar\n"
        "2. Get a free API key from "
        + ("[console.anthropic.com](https://console.anthropic.com/settings/keys)" if provider_name == "Claude"
           else "[aistudio.google.com](https://aistudio.google.com/apikey)")
        + "\n3. Paste it in Settings and hit Save\n"
        "4. Come back here to analyze your charts!"
    )
    st.stop()

model = st.session_state.get("ai_model", "claude-sonnet-4-5-20250514")

img = st.file_uploader("Upload TradingView screenshot", type=["png", "jpg", "jpeg", "webp"])
if img:
    st.image(img, caption="Chart Preview", use_container_width=True)

analyze_btn = st.button("Analyze Chart", type="primary", use_container_width=True, disabled=img is None)

if analyze_btn and img:
    image_bytes = img.read()
    mime = img.type or "image/png"

    with st.spinner("Detecting ICT concepts..."):
        try:
            result = analyze_chart_with_ai(
                image_bytes=image_bytes,
                mime_type=mime,
                provider_name=provider_name,
                model=model,
            )
        except Exception as e:
            st.error(f"Chart analysis failed: {e}")
            st.stop()

    st.subheader("Results")
    c1, c2, c3 = st.columns(3)
    c1.metric("Bias", str(result.get("market_bias", "unknown")).upper())
    c2.metric("Timeframe Guess", str(result.get("timeframe_guess", "unknown")))
    c3.metric("Detected Key Levels", len(result.get("key_levels", []) or []))

    concepts = result.get("concepts", {})

    st.markdown("### Detected ICT Concepts")
    for key in ["order_blocks", "fvg", "bos_mss", "liquidity_levels"]:
        items = concepts.get(key, []) or []
        with st.expander(f"{key.replace('_', ' ').upper()} ({len(items)})", expanded=(len(items) > 0)):
            if not items:
                st.caption("No strong detections")
            else:
                for i, it in enumerate(items, 1):
                    st.markdown(f"**{i}.** {it.get('description', '—')}")
                    st.caption(json.dumps(it, ensure_ascii=False))

    st.markdown("### Summary")
    st.write(result.get("summary", "No summary returned."))

    st.markdown("### Trade Idea")
    st.json(result.get("trade_idea", {}), expanded=True)

    st.markdown("### Raw Structured JSON")
    st.json(result, expanded=False)
