import streamlit as st
from datetime import date, timedelta

from lib.database import (
    get_all_trades,
    get_journal_dates,
    get_journals_in_range,
    get_journal,
)
from lib.knowledge.vector_store import get_collection_stats
from lib.trading_calendar import render_trading_calendar
from lib.auth import get_current_user_id

st.markdown(
    '<div style="font-size:1.8rem; font-weight:700; color:#e8651a; letter-spacing:3px; '
    'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15); '
    'margin-bottom:8px;">DASHBOARD</div>',
    unsafe_allow_html=True,
)

user_id = get_current_user_id()

all_trades = get_all_trades(limit=5000, user_id=user_id)

# ============================================================
# TRADING CALENDAR (top of page)
# ============================================================

render_trading_calendar(key_prefix="dash_tcal", user_id=user_id)

st.divider()


# ============================================================
# HELPER: stat card
# ============================================================
def stat_card(label, value, color="#f5f5f5", sub_text=""):
    sub_html = f'<div style="color:#666; font-size:0.7rem; margin-top:2px;">{sub_text}</div>' if sub_text else ""
    return (
        f'<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
        f'padding:16px; text-align:center;">'
        f'<div style="color:#888; font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; '
        f'margin-bottom:4px;">{label}</div>'
        f'<div style="color:{color}; font-size:1.5rem; font-weight:700;">{value}</div>'
        f'{sub_html}'
        f'</div>'
    )


# ============================================================
# COMPUTE STATS (safe for empty trades)
# ============================================================
today = date.today()
today_str = today.strftime("%Y-%m-%d")

total_pips = sum(t.pnl_pips for t in all_trades) if all_trades else 0
total_dollar = sum(t.pnl_dollar for t in all_trades if t.pnl_dollar) if all_trades else 0
winners = [t for t in all_trades if t.pnl_pips > 0] if all_trades else []
losers = [t for t in all_trades if t.pnl_pips < 0] if all_trades else []
win_rate = len(winners) / len(all_trades) * 100 if all_trades else 0
avg_win_dollar = sum(t.pnl_dollar for t in winners if t.pnl_dollar) / len(winners) if winners else 0
avg_loss_dollar = sum(t.pnl_dollar for t in losers if t.pnl_dollar) / len(losers) if losers else 0
losers_pnl = sum(t.pnl_pips for t in losers)
winners_pnl = sum(t.pnl_pips for t in winners)
profit_factor = abs(winners_pnl / losers_pnl) if losers_pnl != 0 else float("inf")
rr_ratio = abs(avg_win_dollar / avg_loss_dollar) if avg_loss_dollar != 0 else 0

# Max drawdown (dollar-based)
sorted_trades = sorted(all_trades, key=lambda t: (t.trade_date, t.id)) if all_trades else []
peak_dollar = 0.0
max_dd_dollar = 0.0
running_dollar = 0.0
for t in sorted_trades:
    running_dollar += t.pnl_dollar if t.pnl_dollar else 0
    if running_dollar > peak_dollar:
        peak_dollar = running_dollar
    dd = peak_dollar - running_dollar
    if dd > max_dd_dollar:
        max_dd_dollar = dd

# Trading days
trading_days = set(t.trade_date for t in all_trades) if all_trades else set()
winning_days = set()
losing_days = set()
for d in trading_days:
    day_pnl = sum(t.pnl_pips for t in all_trades if t.trade_date == d)
    if day_pnl > 0:
        winning_days.add(d)
    elif day_pnl < 0:
        losing_days.add(d)


def fmt_dollar(val: float) -> str:
    """Format dollar: positive = '$1,234.56' (no +), negative = '-$1,234.56'."""
    if val < 0:
        return f"-${abs(val):,.2f}"
    return f"${val:,.2f}"

# ============================================================
# STATS OVERVIEW
# ============================================================

st.markdown(
    '<div style="margin-bottom:4px;">'
    '<div style="font-size:1.3rem; font-weight:700; color:#e8651a; letter-spacing:2px; '
    'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15);">STATS OVERVIEW</div>'
    '<div style="color:#888; font-size:0.85rem;">Your all-time trading performance at a glance</div>'
    '</div>',
    unsafe_allow_html=True,
)

pnl_color = "#22c55e" if total_dollar > 0 else "#ef4444" if total_dollar < 0 else "#a0a0a0"
wr_color = "#22c55e" if win_rate >= 55 else "#e8651a" if win_rate >= 45 else "#ef4444"
pf_val = f"{profit_factor:.2f}" if profit_factor != float("inf") else "—"
rr_val = f"{rr_ratio:.2f}" if rr_ratio > 0 else "—"

row1 = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:12px 0 8px 0;">'
row1 += stat_card("Net P&L", fmt_dollar(total_dollar) if all_trades else "—", pnl_color)
row1 += stat_card("Win Rate", f"{win_rate:.1f}%" if all_trades else "—", wr_color,
                   f"{len(winners)}W / {len(losers)}L" if all_trades else "No trades yet")
row1 += stat_card("Profit Factor", pf_val,
                   "#22c55e" if profit_factor > 1.5 else "#e8651a" if profit_factor > 1 else "#ef4444")
row1 += stat_card("Max Drawdown", fmt_dollar(max_dd_dollar) if all_trades else "—", "#ef4444",
                   "from peak" if all_trades else "")
row1 += '</div>'
st.markdown(row1, unsafe_allow_html=True)

row2 = '<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:8px;">'
row2 += stat_card("Trades", str(len(all_trades)), "#f5f5f5",
                   f"{len(trading_days)} days" if all_trades else "")
row2 += stat_card("Avg Win", fmt_dollar(avg_win_dollar) if winners else "—", "#22c55e")
row2 += stat_card("Avg Loss", fmt_dollar(avg_loss_dollar) if losers else "—", "#ef4444")
row2 += stat_card("R:R Ratio", rr_val,
                   "#22c55e" if rr_ratio >= 2 else "#e8651a" if rr_ratio >= 1 else "#ef4444")
row2 += stat_card("Current P&L", fmt_dollar(running_dollar) if all_trades else "—",
                   "#22c55e" if running_dollar > 0 else "#ef4444")
row2 += '</div>'
st.markdown(row2, unsafe_allow_html=True)

st.write("")

# ============================================================
# DONUT CHART + EQUITY CURVE (side by side)
# ============================================================

donut_col, eq_col = st.columns([1, 3])

with donut_col:
    # SVG donut chart
    win_pct = win_rate / 100
    loss_pct = len(losers) / len(all_trades) if all_trades else 0

    circumference = 2 * 3.14159 * 45
    win_dash = win_pct * circumference
    loss_dash = loss_pct * circumference
    loss_offset = -(win_dash)

    # If no trades, show empty ring
    center_text = f"{win_rate:.0f}%" if all_trades else "—"
    center_color = wr_color if all_trades else "#888"

    donut_svg = f'''
    <div style="text-align:center; padding:8px;">
        <svg viewBox="0 0 120 120" width="180" height="180">
            <circle cx="60" cy="60" r="45" fill="none" stroke="#1e1a17" stroke-width="12"/>
            <circle cx="60" cy="60" r="45" fill="none" stroke="#22c55e" stroke-width="12"
                    stroke-dasharray="{win_dash} {circumference}" stroke-dashoffset="0"
                    transform="rotate(-90 60 60)" stroke-linecap="round"/>
            <circle cx="60" cy="60" r="45" fill="none" stroke="#ef4444" stroke-width="12"
                    stroke-dasharray="{loss_dash} {circumference}" stroke-dashoffset="{loss_offset}"
                    transform="rotate(-90 60 60)" stroke-linecap="round"/>
            <text x="60" y="55" text-anchor="middle" fill="{center_color}" font-size="18" font-weight="700">{center_text}</text>
            <text x="60" y="72" text-anchor="middle" fill="#888" font-size="8">WIN RATE</text>
        </svg>
        <div style="display:flex; justify-content:center; gap:12px; margin-top:4px;">
            <span style="color:#22c55e; font-size:0.75rem;">&#9679; {len(winners)}W</span>
            <span style="color:#ef4444; font-size:0.75rem;">&#9679; {len(losers)}L</span>
        </div>
    </div>
    '''
    st.markdown(donut_svg, unsafe_allow_html=True)

with eq_col:
    st.markdown("**Performance Chart**")
    if sorted_trades:
        cumulative = {}
        running_eq = 0.0
        for t in sorted_trades:
            running_eq += t.pnl_dollar if t.pnl_dollar else 0
            cumulative[t.trade_date] = running_eq
        if cumulative:
            st.line_chart(cumulative, color="#e8651a")
    else:
        st.markdown(
            '<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
            'padding:40px; text-align:center; color:#666; font-size:0.9rem;">'
            'Your equity curve will appear here once you log trades.'
            '</div>',
            unsafe_allow_html=True,
        )

st.divider()

# ============================================================
# RECENT TRADES + STREAKS (side by side)
# ============================================================

recent_col, streak_col = st.columns([3, 2])

with recent_col:
    st.markdown(
        '<div style="font-size:1.1rem; font-weight:700; color:#e8651a; letter-spacing:2px; '
        'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15); '
        'margin-bottom:8px;">RECENT TRADES</div>',
        unsafe_allow_html=True,
    )

    if all_trades:
        for t in all_trades[:10]:
            pnl_color_t = "#22c55e" if t.pnl_pips > 0 else "#ef4444" if t.pnl_pips < 0 else "#888"
            result = "W" if t.pnl_pips > 0 else "L" if t.pnl_pips < 0 else "BE"
            dollar_display = fmt_dollar(t.pnl_dollar) if t.pnl_dollar else ""

            st.markdown(
                f'<div style="padding:6px 8px; border-bottom:1px solid #1a1a1a; display:flex; '
                f'justify-content:space-between; align-items:center;">'
                f'<div>'
                f'<span style="color:#a0a0a0; font-size:0.75rem;">{t.trade_date}</span> '
                f'<strong style="color:#f5f5f5;">{t.pair}</strong> '
                f'<span style="color:#888; font-size:0.8rem;">{t.direction.upper()}</span>'
                f'</div>'
                f'<div style="text-align:right;">'
                f'<span style="color:{pnl_color_t}; font-weight:700;">{dollar_display}</span>'
                f'<span style="color:{pnl_color_t}; font-size:0.75rem;"> {result}</span>'
                f'</div>'
                f'</div>',
                unsafe_allow_html=True,
            )
    else:
        st.markdown(
            '<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
            'padding:30px; text-align:center; color:#666; font-size:0.9rem;">'
            'No trades logged yet. Your recent trades will show here.'
            '</div>',
            unsafe_allow_html=True,
        )

with streak_col:
    st.markdown(
        '<div style="font-size:1.1rem; font-weight:700; color:#e8651a; letter-spacing:2px; '
        'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15); '
        'margin-bottom:8px;">STREAKS</div>',
        unsafe_allow_html=True,
    )

    # Journal streak
    journal_dates = set(get_journal_dates(user_id=user_id))
    journal_streak = 0
    check_date = today
    while check_date.strftime("%Y-%m-%d") in journal_dates:
        journal_streak += 1
        check_date -= timedelta(days=1)

    # Trading day streak (profitable)
    trading_dates_sorted = sorted(trading_days, reverse=True) if trading_days else []
    profitable_streak = 0
    for d in trading_dates_sorted:
        day_pnl = sum(t.pnl_pips for t in all_trades if t.trade_date == d)
        if day_pnl > 0:
            profitable_streak += 1
        else:
            break

    # Rules followed streak
    journals = get_journals_in_range((today - timedelta(days=90)).strftime("%Y-%m-%d"), today_str, user_id=user_id)
    rules_streak = 0
    for j in sorted(journals, key=lambda x: x.journal_date, reverse=True):
        if not j.mistakes:
            rules_streak += 1
        else:
            break

    streak_html = '<div style="display:grid; grid-template-columns:1fr; gap:6px;">'
    streak_html += stat_card("Journal Streak", f"{journal_streak} days", "#e8651a" if journal_streak >= 3 else "#888")
    streak_html += stat_card("Profitable Day Streak", f"{profitable_streak} days",
                             "#22c55e" if profitable_streak >= 3 else "#888")
    streak_html += stat_card("Rules Followed Streak", f"{rules_streak} days",
                             "#22c55e" if rules_streak >= 3 else "#888")

    # Today's readiness
    today_journal = get_journal(today_str, user_id=user_id)
    if today_journal:
        r_color = "#22c55e" if today_journal.readiness_score >= 7 else "#e8651a" if today_journal.readiness_score >= 4 else "#ef4444"
        streak_html += stat_card("Today's Readiness", f"{today_journal.readiness_score}/10", r_color,
                                 today_journal.readiness_label or "")
    else:
        streak_html += stat_card("Today's Readiness", "—", "#888", "Fill out journal")

    streak_html += '</div>'
    st.markdown(streak_html, unsafe_allow_html=True)

st.divider()

# ============================================================
# ACHIEVEMENTS
# ============================================================
st.markdown(
    '<div style="font-size:1.1rem; font-weight:700; color:#e8651a; letter-spacing:2px; '
    'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15); '
    'margin-bottom:8px;">ACHIEVEMENTS</div>',
    unsafe_allow_html=True,
)

badges = []

if all_trades and len(all_trades) >= 1:
    badges.append(("First Trade Logged", "Entered your first trade into The Chamber"))
if all_trades and len(all_trades) >= 10:
    badges.append(("10 Trades Logged", "Building the habit — 10 trades tracked"))
if all_trades and len(all_trades) >= 50:
    badges.append(("50 Trade Veteran", "Serious commitment — 50 trades analyzed"))
if all_trades and len(all_trades) >= 100:
    badges.append(("Century Club", "100 trades in the books"))

# First Profitable Week
if all_trades:
    week_start = today - timedelta(days=today.weekday())
    for weeks_back in range(52):
        ws = week_start - timedelta(weeks=weeks_back)
        we = ws + timedelta(days=4)
        week_trades = [t for t in all_trades if ws.strftime("%Y-%m-%d") <= t.trade_date <= we.strftime("%Y-%m-%d")]
        if week_trades and sum(t.pnl_pips for t in week_trades) > 0:
            badges.append(("First Profitable Week", "Closed a full week in the green"))
            break

if journal_streak >= 7:
    badges.append(("7-Day Journal Streak", "A full week of daily journaling"))
if all_trades and len(all_trades) >= 20 and win_rate >= 60:
    badges.append(("Sniper", "60%+ win rate across 20+ trades"))

kb_stats = get_collection_stats()
if kb_stats["total_chunks"] > 0:
    badges.append(("ICT Scholar", "Knowledge base loaded with ICT teachings"))

if badges:
    # Render as grid
    cols_per_row = min(len(badges), 4)
    badges_html = f'<div style="display:grid; grid-template-columns:repeat({cols_per_row},1fr); gap:8px;">'
    for name, desc in badges:
        badges_html += (
            f'<div style="text-align:center; padding:12px; background:#141414; '
            f'border:1px solid #e8651a33; border-radius:8px;">'
            f'<div style="font-size:1.5rem;">&#x1F3C6;</div>'
            f'<div style="color:#e8651a; font-weight:600; font-size:0.85rem;">{name}</div>'
            f'<div style="color:#888; font-size:0.7rem;">{desc}</div>'
            f'</div>'
        )
    badges_html += '</div>'
    st.markdown(badges_html, unsafe_allow_html=True)
else:
    st.markdown(
        '<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
        'padding:24px; text-align:center; color:#666; font-size:0.9rem;">'
        'Complete milestones to earn badges! Start by logging your first trade.'
        '</div>',
        unsafe_allow_html=True,
    )

st.divider()

# ============================================================
# DAILY ICT TIP
# ============================================================
st.markdown(
    '<div style="font-size:1.1rem; font-weight:700; color:#e8651a; letter-spacing:2px; '
    'text-shadow:0 0 20px rgba(232,101,26,0.4), 0 0 40px rgba(232,101,26,0.15); '
    'margin-bottom:8px;">ICT CONCEPT OF THE DAY</div>',
    unsafe_allow_html=True,
)

if kb_stats["total_chunks"] > 0:
    from lib.knowledge.vector_store import query_similar

    concepts = [
        "order block entry technique", "fair value gap trading",
        "liquidity sweep and stop hunt", "market structure shift",
        "optimal trade entry fibonacci", "kill zone timing London New York",
        "power of 3 accumulation manipulation distribution",
        "premium discount equilibrium", "displacement candle",
        "breaker block", "silver bullet setup", "ICT macro timing",
    ]
    day_idx = today.timetuple().tm_yday % len(concepts)
    concept_query = concepts[day_idx]

    results = query_similar(concept_query, n_results=1)
    if results:
        r = results[0]
        tags = ", ".join(r["concept_tags"]) if r["concept_tags"] else "General"

        st.markdown(
            f'<div style="background:#141414; border:1px solid #e8651a33; border-radius:8px; padding:16px;">'
            f'<div style="color:#e8651a; font-weight:700; margin-bottom:4px;">{r["video_title"]}</div>'
            f'<div style="color:#888; font-size:0.8rem; margin-bottom:8px;">Concepts: {tags}</div>'
            f'<div style="color:#d0d0d0; font-size:0.9rem; line-height:1.5;">{r["text"][:600]}...</div>'
            f'</div>',
            unsafe_allow_html=True,
        )
        if r["video_url"]:
            st.caption(f"[Watch full lesson on YouTube]({r['video_url']})")
else:
    st.caption("Index the knowledge base to get daily ICT tips.")
