import streamlit as st
from datetime import datetime, timezone, timedelta

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("Live News")
st.caption("Real-time market news from Financial Juice. Auto-categorized for traders.")

from lib.financial_juice import fetch_news

# ============================================================
# CONTROLS
# ============================================================

cc1, cc2, cc3 = st.columns([2, 2, 1])

with cc1:
    CATEGORIES = [
        "All",
        "Economic Data",
        "Central Banks",
        "Geopolitical",
        "Commodities",
        "Equities",
        "Forex",
        "Crypto",
        "Market News",
    ]
    filter_cat = st.selectbox("Category", CATEGORIES, key="news_cat")

with cc2:
    TIME_RANGES = ["All Time", "Last Hour", "Last 4 Hours", "Today"]
    filter_time = st.selectbox("Time Range", TIME_RANGES, key="news_time")

with cc3:
    st.write("")  # spacing
    if st.button("Refresh", type="primary", key="news_refresh"):
        news = fetch_news(force_refresh=True)
        st.rerun()

# ============================================================
# FETCH & FILTER
# ============================================================

news = fetch_news()

if not news:
    st.info("Could not fetch news. Check your internet connection.")
    st.stop()

# Apply category filter
if filter_cat != "All":
    news = [n for n in news if n["category"] == filter_cat]

# Apply time filter
now_utc = datetime.now(timezone.utc)
if filter_time == "Last Hour":
    cutoff = now_utc - timedelta(hours=1)
    news = [n for n in news if n["pub_date"] and n["pub_date"] >= cutoff]
elif filter_time == "Last 4 Hours":
    cutoff = now_utc - timedelta(hours=4)
    news = [n for n in news if n["pub_date"] and n["pub_date"] >= cutoff]
elif filter_time == "Today":
    est = timezone(timedelta(hours=-5))
    today_est = datetime.now(est).date()
    news = [n for n in news if n["pub_date"] and n["pub_date"].astimezone(est).date() == today_est]

# ============================================================
# CATEGORY STATS
# ============================================================

all_news = fetch_news()
cat_counts = {}
for n in all_news:
    cat = n["category"]
    cat_counts[cat] = cat_counts.get(cat, 0) + 1

# Category color map
CAT_COLORS = {
    "Economic Data": "#ef4444",
    "Central Banks": "#e8651a",
    "Geopolitical": "#a855f7",
    "Commodities": "#eab308",
    "Equities": "#22c55e",
    "Forex": "#3b82f6",
    "Crypto": "#06b6d4",
    "Market News": "#a0a0a0",
}

# Stats row
sc1, sc2, sc3, sc4 = st.columns(4)
sc1.metric("Total Headlines", len(all_news))
sc2.metric("Showing", len(news))

# Top categories
sorted_cats = sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)
if len(sorted_cats) >= 1:
    sc3.metric(f"Top: {sorted_cats[0][0]}", sorted_cats[0][1])
if len(sorted_cats) >= 2:
    sc4.metric(f"2nd: {sorted_cats[1][0]}", sorted_cats[1][1])

st.divider()

# ============================================================
# NEWS FEED
# ============================================================

if not news:
    st.warning("No news matches your filters.")
    st.stop()

for item in news:
    cat = item["category"]
    color = CAT_COLORS.get(cat, "#a0a0a0")
    time_str = item["pub_date_str"]
    ago = item["time_ago"]

    # Highlight economic data and central bank news
    is_high_impact = cat in {"Economic Data", "Central Banks"}
    border = f"2px solid {color}" if is_high_impact else f"1px solid {color}44"
    glow = f"box-shadow: 0 0 8px {color}22;" if is_high_impact else ""

    st.markdown(
        f'<div style="padding:10px 14px; border-left:{border}; margin-bottom:6px; {glow}">'
        f'<span style="color:{color}; font-weight:600; font-size:0.75rem;">'
        f'[{cat}]</span> '
        f'<span style="color:#f5f5f5; font-size:0.95rem;">{item["title"]}</span>'
        f'<br><span style="color:#666; font-size:0.75rem;">'
        f'{time_str} EST &middot; {ago}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

# ============================================================
# FOOTER
# ============================================================

st.divider()
st.caption("Data sourced from Financial Juice. News auto-refreshes every 2 minutes.")
st.caption("**Tip:** Economic Data and Central Banks headlines are highlighted — these move markets the most.")
