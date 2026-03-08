import streamlit as st

from lib.knowledge.vector_store import get_collection_stats, query_similar, get_all_metadata
from lib.knowledge.chunker import ICT_CONCEPT_PATTERNS

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("Learning Hub")
st.caption("Structured ICT curriculum pulled from 675+ of ICT's YouTube lectures")

kb_stats = get_collection_stats()
has_knowledge_base = kb_stats["total_chunks"] > 0

if not has_knowledge_base:
    st.info("💡 Knowledge base not loaded — showing the ICT curriculum structure. "
            "For lesson content from ICT's actual lectures, run the indexer locally.")

# ============================================================
# ICT CURRICULUM
# ============================================================

# Organized learning path from beginner to advanced
CURRICULUM = [
    {
        "level": "Foundation",
        "color": "#22c55e",
        "topics": [
            {
                "name": "Market Structure",
                "query": "market structure shift break of structure higher high lower low swing points",
                "description": "The skeleton of price action. Learn to read swing highs, swing lows, BOS, and MSS — the foundation everything else builds on.",
            },
            {
                "name": "Liquidity",
                "query": "liquidity pool stop hunt sweep buy side sell side equal highs equal lows",
                "description": "Where the money is. Smart money targets liquidity resting above highs and below lows. Learn to see where stops are sitting.",
            },
            {
                "name": "Premium & Discount",
                "query": "premium discount equilibrium dealing range 50 percent level",
                "description": "Buy low, sell high — but with precision. The premium/discount model tells you WHERE in the range to look for entries.",
            },
        ],
    },
    {
        "level": "Core Concepts",
        "color": "#e8651a",
        "topics": [
            {
                "name": "Order Blocks",
                "query": "order block last bearish candle before bullish impulse institutional candle",
                "description": "The footprints of institutional orders. The last opposing candle before displacement — your go-to entry model.",
            },
            {
                "name": "Fair Value Gaps",
                "query": "fair value gap imbalance three candle pattern consequent encroachment",
                "description": "Price imbalances that act as magnets. When candle 1 and candle 3 wicks don't overlap, there's unfinished business.",
            },
            {
                "name": "Displacement",
                "query": "displacement impulse move strong candle institutional conviction",
                "description": "The signature of smart money. Large-bodied candles with small wicks showing aggressive, one-sided flow.",
            },
            {
                "name": "Optimal Trade Entry",
                "query": "optimal trade entry OTE fibonacci 62 79 percent retracement sweet spot",
                "description": "The 62-79% fib zone. After an MSS, this is where you look for entries — the sweet spot at 70.5%.",
            },
        ],
    },
    {
        "level": "Timing & Sessions",
        "color": "#3b82f6",
        "topics": [
            {
                "name": "Kill Zones",
                "query": "kill zone London open New York session Asia range timing",
                "description": "Not all hours are equal. London Open, NY Open, and London Close are where the highest-probability setups form.",
            },
            {
                "name": "Power of 3 (AMD)",
                "query": "power of three accumulation manipulation distribution judas swing",
                "description": "Every session follows the same script: accumulate, manipulate (fake out), then distribute (real move).",
            },
            {
                "name": "Silver Bullet",
                "query": "silver bullet 10 to 11 AM 2 to 3 PM FVG entry window",
                "description": "Specific time windows (10-11 AM, 2-3 PM EST) where FVG entries have the highest probability.",
            },
            {
                "name": "ICT Macros",
                "query": "ICT macro 9:50 10:10 10:50 11:10 micro kill zone timing",
                "description": "Micro kill zones within sessions. Precise 20-minute windows where reversals and entries cluster.",
            },
        ],
    },
    {
        "level": "Advanced",
        "color": "#a855f7",
        "topics": [
            {
                "name": "Breaker Blocks",
                "query": "breaker block failed order block support resistance flip",
                "description": "When an order block fails, it becomes a breaker — support becomes resistance and vice versa.",
            },
            {
                "name": "Mitigation Blocks",
                "query": "mitigation block previous swing point failed revisit",
                "description": "Previous swing points that failed and get revisited. Price returns to mitigate the losses of trapped traders.",
            },
            {
                "name": "Institutional Order Flow",
                "query": "institutional order flow smart money IOFED narrative multi timeframe",
                "description": "Reading the story across timeframes. Where is smart money positioned and where are they going?",
            },
            {
                "name": "PD Arrays & Propulsion Blocks",
                "query": "PD array price delivery matrix propulsion block FVG inside order block",
                "description": "The most advanced confluence — when FVGs nest inside OBs, creating the highest-probability zones.",
            },
        ],
    },
    {
        "level": "Risk & Psychology",
        "color": "#ef4444",
        "topics": [
            {
                "name": "Risk Management",
                "query": "risk management stop loss risk reward position sizing R multiple",
                "description": "The most important concept. Without proper risk management, nothing else matters.",
            },
        ],
    },
]

# ============================================================
# RENDER CURRICULUM
# ============================================================

for section in CURRICULUM:
    st.markdown(
        f'<div style="padding:8px 12px; background:{section["color"]}22; '
        f'border-left:4px solid {section["color"]}; border-radius:4px; margin-bottom:4px;">'
        f'<span style="color:{section["color"]}; font-weight:700; font-size:1.1rem;">'
        f'{section["level"]}</span></div>',
        unsafe_allow_html=True,
    )

    for topic in section["topics"]:
        with st.expander(f"**{topic['name']}**"):
            st.markdown(f"*{topic['description']}*")
            st.divider()

            if has_knowledge_base:
                # Pull relevant teachings
                results = query_similar(topic["query"], n_results=3)

                if results:
                    for i, r in enumerate(results, 1):
                        tags = ", ".join(r["concept_tags"]) if r["concept_tags"] else ""
                        st.markdown(f"**Lesson {i}: {r['video_title']}**")
                        if tags:
                            st.caption(f"Concepts: {tags}")
                        st.markdown(r["text"][:800])
                        if len(r["text"]) > 800:
                            st.caption("*(truncated)*")
                        if r["video_url"]:
                            st.markdown(f"[Watch on YouTube]({r['video_url']})")
                        st.divider()
                else:
                    st.caption("No lessons found for this topic.")
            else:
                st.caption("Lesson content available when knowledge base is loaded.")

    st.write("")  # Spacing between sections
