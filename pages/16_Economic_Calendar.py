import streamlit as st
from datetime import datetime, timezone, timedelta

from lib.forex_calendar import fetch_calendar

try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

st.header("Economic Calendar")
st.caption("Live data from Forex Factory. Red = High Impact, Orange = Medium Impact.")

# EST timezone
est = timezone(timedelta(hours=-5))
now_est = datetime.now(est)
today_date = now_est.date()

# ── Fetch live data ─────────────────────────────────────────
calendar_events = fetch_calendar(force_refresh=False)

if not calendar_events:
    st.info("Could not fetch calendar data. Check your internet connection.")
    st.stop()

# ── Filter toggle ───────────────────────────────────────────
filter_col, refresh_col = st.columns([3, 1])
with filter_col:
    impact_filter = st.segmented_control(
        "Impact Filter",
        ["All", "High Only", "High + Medium"],
        default="High + Medium",
        key="econ_cal_filter",
    )
with refresh_col:
    if st.button("Refresh", key="econ_refresh"):
        calendar_events = fetch_calendar(force_refresh=True)
        st.rerun()

# Keep unfiltered copy for grouping, then filter for display
all_events = list(calendar_events)

if impact_filter == "High Only":
    display_events = [e for e in all_events if e["impact"] == "High"]
elif impact_filter == "High + Medium":
    display_events = [e for e in all_events if e["impact"] in ("High", "Medium")]
else:
    display_events = list(all_events)

# ── Group events by date ────────────────────────────────────
events_by_date: dict[str, list[dict]] = {}
for e in display_events:
    d = e["date"]
    if d not in events_by_date:
        events_by_date[d] = []
    events_by_date[d].append(e)

# ── Build Mon–Fri week range based on TODAY ─────────────────
# Always show the current week (the week containing today)
today_dt = datetime(today_date.year, today_date.month, today_date.day)
week_start = today_dt - timedelta(days=today_dt.weekday())  # Monday
week_days = [week_start + timedelta(days=i) for i in range(5)]  # Mon-Fri

month_label = week_start.strftime("%B %d") + " – " + week_days[-1].strftime("%B %d, %Y")

st.markdown(
    f'<div style="text-align:center; padding:8px 0 4px 0;">'
    f'<span style="color:#f5f5f5; font-size:1.15rem; font-weight:600;">{month_label}</span>'
    f'</div>',
    unsafe_allow_html=True,
)

# ── SVG folder icons ────────────────────────────────────────
# Red folder (high impact)
RED_FOLDER = (
    '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:middle; margin-right:3px;">'
    '<path d="M10 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" '
    'fill="#ef4444"/></svg>'
)
# Orange folder (medium impact)
ORG_FOLDER = (
    '<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:middle; margin-right:3px;">'
    '<path d="M10 4H4C2.9 4 2 4.9 2 6v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" '
    'fill="#e8651a"/></svg>'
)

# ── Week grid: Mon–Fri with folder icons in cells ───────────

# Day headers
header_html = '<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:4px; margin:12px 0 4px 0;">'
for day in week_days:
    is_today = day.date() == today_date
    day_name = day.strftime("%a")
    day_num = day.strftime("%d")
    color = "#e8651a" if is_today else "#a0a0a0"
    weight = "700" if is_today else "600"
    header_html += (
        f'<div style="text-align:center; padding:6px; color:{color}; '
        f'font-size:0.8rem; font-weight:{weight}; text-transform:uppercase; '
        f'letter-spacing:1px;">{day_name} {day_num}</div>'
    )
header_html += '</div>'
st.markdown(header_html, unsafe_allow_html=True)

# Day cells with folder icons
grid_html = '<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:4px;">'

for day in week_days:
    is_today = day.date() == today_date
    date_key = day.strftime("%m-%d-%Y")
    day_events_list = events_by_date.get(date_key, [])

    high_events = [e for e in day_events_list if e["impact"] == "High"]
    med_events = [e for e in day_events_list if e["impact"] == "Medium"]
    low_events = [e for e in day_events_list if e["impact"] not in ("High", "Medium")]

    bg = "#1a1210" if is_today else "#0e0e0e"
    border = "2px solid #e8651a" if is_today else "1px solid #1e1a17"
    today_badge = (
        '<div style="background:#e8651a; color:#0a0a0a; padding:1px 6px; '
        'border-radius:10px; font-size:0.55rem; font-weight:700; display:inline-block; '
        'margin-bottom:6px;">TODAY</div>'
    ) if is_today else ""

    # Build folder event items inside cell
    events_html = ""

    for e in high_events:
        time_str = e["time"] if e["time"] else ""
        events_html += (
            f'<div style="display:flex; align-items:center; gap:3px; margin:3px 0; '
            f'padding:3px 4px; background:rgba(239,68,68,0.1); border-radius:3px;">'
            f'{RED_FOLDER}'
            f'<span style="color:#ef4444; font-weight:700; font-size:0.65rem;">{e["country"]}</span>'
            f'<span style="color:#d0d0d0; font-size:0.6rem; overflow:hidden; text-overflow:ellipsis; '
            f'white-space:nowrap; flex:1;">{e["title"][:25]}</span>'
            f'{"<span style=color:#888;font-size:0.55rem;>" + time_str + "</span>" if time_str else ""}'
            f'</div>'
        )

    for e in med_events:
        time_str = e["time"] if e["time"] else ""
        events_html += (
            f'<div style="display:flex; align-items:center; gap:3px; margin:3px 0; '
            f'padding:3px 4px; background:rgba(232,101,26,0.08); border-radius:3px;">'
            f'{ORG_FOLDER}'
            f'<span style="color:#e8651a; font-weight:700; font-size:0.65rem;">{e["country"]}</span>'
            f'<span style="color:#d0d0d0; font-size:0.6rem; overflow:hidden; text-overflow:ellipsis; '
            f'white-space:nowrap; flex:1;">{e["title"][:25]}</span>'
            f'{"<span style=color:#888;font-size:0.55rem;>" + time_str + "</span>" if time_str else ""}'
            f'</div>'
        )

    # Count summary at top of cell
    count_html = ""
    if high_events or med_events:
        parts = []
        if high_events:
            parts.append(f'<span style="color:#ef4444; font-size:0.6rem;">{len(high_events)} red</span>')
        if med_events:
            parts.append(f'<span style="color:#e8651a; font-size:0.6rem;">{len(med_events)} orange</span>')
        count_html = '<div style="margin-bottom:4px;">' + " ".join(parts) + '</div>'

    grid_html += (
        f'<div style="background:{bg}; border:{border}; border-radius:8px; '
        f'padding:8px 6px; min-height:180px; overflow-y:auto;">'
        f'{today_badge}'
        f'{count_html}'
        f'{events_html}'
        f'{"<div style=color:#444;font-size:0.7rem;padding:30px 0;text-align:center;>No events</div>" if not events_html else ""}'
        f'</div>'
    )

grid_html += '</div>'
st.markdown(grid_html, unsafe_allow_html=True)

# ── Legend ───────────────────────────────────────────────────
legend_html = (
    '<div style="display:flex; gap:16px; justify-content:center; padding:12px 0; flex-wrap:wrap;">'
    '<div style="display:flex; align-items:center; gap:4px;">'
    f'{RED_FOLDER}<span style="color:#888; font-size:0.75rem;">High Impact</span></div>'
    '<div style="display:flex; align-items:center; gap:4px;">'
    f'{ORG_FOLDER}<span style="color:#888; font-size:0.75rem;">Medium Impact</span></div>'
    '</div>'
)
st.markdown(legend_html, unsafe_allow_html=True)

# ── Detailed expandable day view ────────────────────────────
st.divider()
st.markdown("**Full Event Details**")

for day in week_days:
    date_key = day.strftime("%m-%d-%Y")
    day_events_list = events_by_date.get(date_key, [])
    is_today = day.date() == today_date
    day_label = day.strftime("%A, %B %d")
    if is_today:
        day_label += " (TODAY)"

    relevant = [e for e in day_events_list if e["impact"] in ("High", "Medium")]
    if not relevant:
        continue

    high_count = sum(1 for e in relevant if e["impact"] == "High")
    med_count = sum(1 for e in relevant if e["impact"] == "Medium")
    badge_str = ""
    if high_count:
        badge_str += f" — {high_count} High"
    if med_count:
        badge_str += f", {med_count} Medium" if badge_str else f" — {med_count} Medium"

    with st.expander(f"**{day_label}**{badge_str}", expanded=is_today):
        for e in relevant:
            color = "#ef4444" if e["impact"] == "High" else "#e8651a"
            folder = RED_FOLDER if e["impact"] == "High" else ORG_FOLDER
            time_str = e["time"] if e["time"] else "All Day"
            forecast = f" | Forecast: {e['forecast']}" if e["forecast"] else ""
            previous = f" | Previous: {e['previous']}" if e["previous"] else ""

            st.markdown(
                f'<div style="padding:4px 12px; font-size:0.9rem; display:flex; align-items:center; gap:6px;">'
                f'{folder}'
                f'<span style="color:{color}; font-weight:600;">{e["country"]}</span> '
                f'<span style="color:#f5f5f5;">{e["title"]}</span> '
                f'<span style="color:#a0a0a0; font-size:0.8rem;">({time_str}{forecast}{previous})</span></div>',
                unsafe_allow_html=True,
            )

st.divider()

# ── Static reference ────────────────────────────────────────
with st.expander("High-Impact Events Reference"):
    st.markdown("""
**Key recurring events that cause the most volatility:**

| Event | Day | Impact |
|-------|-----|--------|
| **FOMC / Fed Rate Decision** | 8x/year (Wed 2PM EST) | Extreme |
| **Non-Farm Payrolls (NFP)** | First Friday of month (8:30AM EST) | Extreme |
| **CPI / Inflation Data** | Monthly (8:30AM EST) | Very High |
| **ISM Manufacturing/Services** | Monthly | Moderate-High |
| **Jobless Claims** | Every Thursday (8:30AM EST) | Moderate |
| **GDP** | Quarterly | Moderate-High |

**ICT's rule:** Don't trade 30 minutes before or after high-impact news. Let the manipulation play out, then look for displacement and entries in the aftermath.
""")
