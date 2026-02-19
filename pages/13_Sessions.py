import streamlit as st
from datetime import datetime, timezone, timedelta

st.header("Sessions")
st.caption("Kill zone timing, session tracker, and ICT session reference.")

# ============================================================
# KILL ZONE REFERENCE
# ============================================================

# All times in EST (New York)
SESSIONS = [
    {
        "name": "Asia",
        "start": "20:00",
        "end": "00:00",
        "color": "#a855f7",
        "description": "Accumulation phase. Price typically ranges. Defines the high/low for London manipulation.",
        "tips": [
            "Mark Asia range high and low — these are liquidity targets",
            "Don't trade Asia unless you have a clear HTF setup",
            "Asia range is the accumulation in Power of 3",
        ],
    },
    {
        "name": "London Open",
        "start": "02:00",
        "end": "05:00",
        "color": "#3b82f6",
        "description": "Manipulation / first real move. London often sweeps Asia range liquidity before the real move.",
        "tips": [
            "Watch for Judas Swing — false breakout of Asia range",
            "Look for MSS after liquidity sweep of Asia high/low",
            "OB + FVG entries during 2-5 AM EST are high probability",
        ],
    },
    {
        "name": "New York Open",
        "start": "07:00",
        "end": "10:00",
        "color": "#e8651a",
        "description": "Distribution / continuation. The highest volume kill zone. NY either continues London's move or reverses it.",
        "tips": [
            "Silver Bullet window: 10:00-11:00 AM for FVG entries",
            "Look for liquidity sweep of London session high/low",
            "ICT Macros: 9:50-10:10 and 10:50-11:10 are key windows",
        ],
    },
    {
        "name": "London Close",
        "start": "10:00",
        "end": "12:00",
        "color": "#22c55e",
        "description": "Last high-probability window. Often reverses or consolidates the NY move.",
        "tips": [
            "Silver Bullet window: 2:00-3:00 PM EST for FVG entries",
            "ICT Macro: 1:50-2:10 PM EST",
            "Good for scalps and mean-reversion plays",
        ],
    },
]

ICT_MACROS = [
    {"name": "Macro 1", "time": "9:50 - 10:10 AM", "description": "First NY macro — often sets up the 10 AM reversal"},
    {"name": "Macro 2", "time": "10:50 - 11:10 AM", "description": "Second NY macro — continuation or reversal of 10 AM move"},
    {"name": "Macro 3", "time": "1:50 - 2:10 PM", "description": "Afternoon macro — London Close setup window"},
]

SILVER_BULLETS = [
    {"name": "AM Silver Bullet", "time": "10:00 - 11:00 AM EST", "description": "Look for FVG created during this window after the 9:50 macro"},
    {"name": "PM Silver Bullet", "time": "2:00 - 3:00 PM EST", "description": "Look for FVG created during this window after the 1:50 macro"},
]

# ============================================================
# CURRENT TIME & SESSION
# ============================================================

# EST timezone
est = timezone(timedelta(hours=-5))
now_est = datetime.now(est)
current_time = now_est.strftime("%H:%M")
current_hour = now_est.hour
current_minute = now_est.minute


def time_in_range(start_str: str, end_str: str, check_hour: int, check_min: int) -> bool:
    sh, sm = map(int, start_str.split(":"))
    eh, em = map(int, end_str.split(":"))
    check = check_hour * 60 + check_min
    start = sh * 60 + sm
    end = eh * 60 + em
    if start <= end:
        return start <= check < end
    else:  # Wraps midnight
        return check >= start or check < end


active_session = None
for sess in SESSIONS:
    if time_in_range(sess["start"], sess["end"], current_hour, current_minute):
        active_session = sess
        break

# Display current state
st.subheader("Current Session")

tc1, tc2 = st.columns(2)
with tc1:
    st.markdown(f"**EST Time:** `{now_est.strftime('%I:%M %p')}` ({now_est.strftime('%A, %B %d')})")

with tc2:
    if active_session:
        color = active_session["color"]
        st.markdown(
            f'<span style="color:{color}; font-weight:700; font-size:1.2rem;">'
            f'{active_session["name"]} Kill Zone ACTIVE</span>',
            unsafe_allow_html=True,
        )
    else:
        st.markdown(
            '<span style="color:#a0a0a0; font-size:1.1rem;">No active kill zone</span>',
            unsafe_allow_html=True,
        )

# Next session
if not active_session:
    next_session = None
    min_minutes = float("inf")
    for sess in SESSIONS:
        sh, sm = map(int, sess["start"].split(":"))
        sess_start = sh * 60 + sm
        now_min = current_hour * 60 + current_minute
        diff = sess_start - now_min
        if diff < 0:
            diff += 24 * 60
        if diff < min_minutes:
            min_minutes = diff
            next_session = sess

    if next_session:
        hours = min_minutes // 60
        mins = min_minutes % 60
        st.caption(f"Next: **{next_session['name']}** in {hours}h {mins}m")

st.divider()

# ============================================================
# KILL ZONES REFERENCE
# ============================================================

st.subheader("Kill Zones")

for sess in SESSIONS:
    is_active = active_session and active_session["name"] == sess["name"]
    border = f"2px solid {sess['color']}" if is_active else f"1px solid {sess['color']}44"
    glow = f"box-shadow: 0 0 12px {sess['color']}33;" if is_active else ""
    badge = ' <span style="background:#22c55e; color:#0a0a0a; padding:2px 8px; border-radius:4px; font-size:0.7rem; font-weight:700;">LIVE</span>' if is_active else ""

    st.markdown(
        f'<div style="padding:12px; border:{border}; border-radius:6px; margin-bottom:8px; {glow}">'
        f'<span style="color:{sess["color"]}; font-weight:700;">{sess["name"]}</span>{badge}'
        f' <span style="color:#a0a0a0;">— {sess["start"]} - {sess["end"]} EST</span><br>'
        f'<span style="color:#d0d0d0; font-size:0.85rem;">{sess["description"]}</span>'
        f'</div>',
        unsafe_allow_html=True,
    )

    with st.expander(f"{sess['name']} Tips"):
        for tip in sess["tips"]:
            st.markdown(f"- {tip}")

st.divider()

# ============================================================
# ICT MACROS & SILVER BULLETS
# ============================================================

mc1, mc2 = st.columns(2)

with mc1:
    st.subheader("ICT Macros")
    for macro in ICT_MACROS:
        st.markdown(
            f'<div style="padding:8px 12px; border-left:3px solid #e8651a; margin-bottom:6px;">'
            f'<strong>{macro["name"]}</strong> — {macro["time"]}<br>'
            f'<span style="color:#a0a0a0; font-size:0.85rem;">{macro["description"]}</span></div>',
            unsafe_allow_html=True,
        )

with mc2:
    st.subheader("Silver Bullets")
    for sb in SILVER_BULLETS:
        st.markdown(
            f'<div style="padding:8px 12px; border-left:3px solid #3b82f6; margin-bottom:6px;">'
            f'<strong>{sb["name"]}</strong> — {sb["time"]}<br>'
            f'<span style="color:#a0a0a0; font-size:0.85rem;">{sb["description"]}</span></div>',
            unsafe_allow_html=True,
        )

st.divider()

# ============================================================
# POWER OF 3 GUIDE
# ============================================================

st.subheader("Power of 3 (AMD) — Session Roadmap")

amd_phases = [
    {
        "phase": "Accumulation",
        "session": "Asia (8PM-12AM EST)",
        "color": "#a855f7",
        "description": "Price consolidates in a range. Smart money is quietly building positions. Mark the high and low — these are the targets.",
    },
    {
        "phase": "Manipulation",
        "session": "London Open (2-5AM EST)",
        "color": "#3b82f6",
        "description": "The Judas Swing. Price breaks one side of the Asia range to sweep liquidity and trap retail traders. This is the FAKE move.",
    },
    {
        "phase": "Distribution",
        "session": "NY Open (7-10AM EST)",
        "color": "#e8651a",
        "description": "The REAL move. After manipulation, smart money distributes in the intended direction. This is where you want to be positioned.",
    },
]

for phase in amd_phases:
    st.markdown(
        f'<div style="padding:12px; border-left:4px solid {phase["color"]}; '
        f'background:{phase["color"]}11; border-radius:4px; margin-bottom:8px;">'
        f'<span style="color:{phase["color"]}; font-weight:700; font-size:1.1rem;">'
        f'{phase["phase"]}</span>'
        f' <span style="color:#a0a0a0;">— {phase["session"]}</span><br>'
        f'<span style="color:#d0d0d0; font-size:0.9rem;">{phase["description"]}</span></div>',
        unsafe_allow_html=True,
    )

