import json

import streamlit as st

from lib.chart_annotator import analyze_chart_with_ai

st.header("TradingView Chart Analyzer")

st.markdown(
    """
    <style>
    .stApp { background-color: #0a0a0a; }
    .ca-card {
        background: #141414;
        border: 1px solid #1e1a17;
        border-radius: 14px;
        padding: 1rem;
        margin-bottom: 0.8rem;
    }
    .ca-accent { color: #e8651a; font-weight: 700; }
    </style>
    """,
    unsafe_allow_html=True,
)

provider = st.selectbox("AI Provider", ["Claude", "Gemini"], index=0)
if provider == "Claude":
    model = st.selectbox(
        "Model",
        ["claude-sonnet-4-5-20250514", "claude-opus-4-5-20250101"],
        index=0,
    )
else:
    model = st.selectbox(
        "Model",
        ["gemini-2.0-flash", "gemini-2.5-pro-preview-05-06"],
        index=0,
    )

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
                provider_name=provider,
                model=model,
            )
        except Exception as e:
            st.error(f"Chart analysis failed: {e}")
            st.stop()

    st.subheader("Annotated Results")
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
