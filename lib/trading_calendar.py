"""
Shared Trading Calendar component for Dashboard and Performance pages.
Renders a full-month P&L calendar matching The Chamber design:
  - "Trading Calendar" header with subtitle
  - Stat cards row (Monthly P&L, Total Trades, Trading Days, Winning Days, Losing Days, Win Rate)
  - Prev / Month Year / Today / Next navigation
  - Sun–Sat full month grid with large cells
  - Legend: Profit, Loss, Mental Score, Journal Entry, Today
"""
import calendar as cal_module
import streamlit as st
from collections import defaultdict
from datetime import date

from lib.database import get_trades_in_range, get_journals_in_range


def _stat_card(label: str, value: str, color: str = "#f5f5f5", sub_text: str = "") -> str:
    sub_html = (
        f'<div style="color:#666; font-size:0.7rem; margin-top:2px;">{sub_text}</div>'
        if sub_text else ""
    )
    return (
        f'<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
        f'padding:14px 8px; text-align:center;">'
        f'<div style="color:#888; font-size:0.7rem; text-transform:uppercase; letter-spacing:1px; '
        f'margin-bottom:4px;">{label}</div>'
        f'<div style="color:{color}; font-size:1.3rem; font-weight:700;">{value}</div>'
        f'{sub_html}'
        f'</div>'
    )


def render_trading_calendar(key_prefix: str = "tcal", user_id: int = 1) -> None:
    """Render the full Trading Calendar component.

    Args:
        key_prefix: unique prefix for session state keys (use different values
                    if rendered on multiple pages to avoid key collisions).
        user_id: the logged-in user's ID for data isolation.
    """
    today = date.today()

    # ── Session state for month navigation ──────────────────────
    month_key = f"{key_prefix}_month"
    year_key = f"{key_prefix}_year"

    if month_key not in st.session_state:
        st.session_state[month_key] = today.month
        st.session_state[year_key] = today.year

    cal_month = st.session_state[month_key]
    cal_year = st.session_state[year_key]

    # ── Fetch trades + journals for this month ──────────────────
    month_start = f"{cal_year}-{cal_month:02d}-01"
    _, last_day = cal_module.monthrange(cal_year, cal_month)
    month_end = f"{cal_year}-{cal_month:02d}-{last_day:02d}"

    month_trades = get_trades_in_range(month_start, month_end, user_id=user_id)
    month_journals = get_journals_in_range(month_start, month_end, user_id=user_id)

    journal_dates = {j.journal_date for j in month_journals}
    journal_scores = {j.journal_date: j.readiness_score for j in month_journals}

    daily_pnl: dict[str, float] = defaultdict(float)
    daily_count: dict[str, int] = defaultdict(int)
    daily_dollar: dict[str, float] = defaultdict(float)
    for t in month_trades:
        daily_pnl[t.trade_date] += t.pnl_pips
        daily_count[t.trade_date] += 1
        if t.pnl_dollar:
            daily_dollar[t.trade_date] += t.pnl_dollar

    trading_days = set(daily_count.keys())
    winning_days = {d for d in trading_days if daily_pnl[d] > 0}
    losing_days = {d for d in trading_days if daily_pnl[d] < 0}

    m_total = sum(t.pnl_pips for t in month_trades) if month_trades else 0
    m_dollar = sum(t.pnl_dollar for t in month_trades if t.pnl_dollar) if month_trades else 0
    m_wins = sum(1 for t in month_trades if t.pnl_pips > 0)
    m_wr = m_wins / len(month_trades) * 100 if month_trades else 0
    m_color = "#22c55e" if m_total > 0 else "#ef4444" if m_total < 0 else "#a0a0a0"

    # ── Header ──────────────────────────────────────────────────
    st.markdown(
        '<div style="margin-bottom:4px;">'
        '<div style="color:#f5f5f5; font-size:1.4rem; font-weight:700;">Trading Calendar</div>'
        '<div style="color:#888; font-size:0.85rem;">Review your trading performance by date</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Stat cards row ──────────────────────────────────────────
    cards = '<div style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:12px 0 16px 0;">'
    cards += _stat_card(
        "Monthly P&L",
        f"{m_total:+.1f}",
        m_color,
        f"${m_dollar:+,.2f}" if m_dollar else "pips",
    )
    cards += _stat_card("Total Trades", str(len(month_trades)), "#f5f5f5")
    cards += _stat_card("Trading Days", str(len(trading_days)), "#e8651a")
    cards += _stat_card(
        "Winning Days",
        str(len(winning_days)),
        "#22c55e",
    )
    cards += _stat_card(
        "Losing Days",
        str(len(losing_days)),
        "#ef4444",
    )
    cards += _stat_card(
        "Win Rate",
        f"{m_wr:.0f}%",
        "#22c55e" if m_wr >= 55 else "#e8651a" if m_wr >= 45 else "#ef4444",
    )
    cards += '</div>'
    st.markdown(cards, unsafe_allow_html=True)

    # ── Month navigation ────────────────────────────────────────
    nav1, nav2, nav3, nav4 = st.columns([1, 4, 1, 1])

    with nav1:
        if st.button("< Prev", key=f"{key_prefix}_prev"):
            if st.session_state[month_key] == 1:
                st.session_state[month_key] = 12
                st.session_state[year_key] -= 1
            else:
                st.session_state[month_key] -= 1
            st.rerun()

    with nav2:
        st.markdown(
            f'<div style="text-align:center; font-size:1.2rem; font-weight:600; color:#f5f5f5; '
            f'padding-top:6px;">{cal_module.month_name[cal_month]} {cal_year}</div>',
            unsafe_allow_html=True,
        )

    with nav3:
        if st.button("Today", key=f"{key_prefix}_today"):
            st.session_state[month_key] = today.month
            st.session_state[year_key] = today.year
            st.rerun()

    with nav4:
        if st.button("Next >", key=f"{key_prefix}_next"):
            if st.session_state[month_key] == 12:
                st.session_state[month_key] = 1
                st.session_state[year_key] += 1
            else:
                st.session_state[month_key] += 1
            st.rerun()

    # ── Day-of-week headers (Sun first) ─────────────────────────
    day_headers = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    header_html = '<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin:8px 0 4px 0;">'
    for dh in day_headers:
        header_html += (
            f'<div style="text-align:center; padding:6px; color:#888; font-size:0.75rem; '
            f'font-weight:600; text-transform:uppercase; letter-spacing:1px;">{dh}</div>'
        )
    header_html += '</div>'
    st.markdown(header_html, unsafe_allow_html=True)

    # ── Calendar grid (Sunday start) ────────────────────────────
    cal_obj = cal_module.Calendar(firstweekday=6)  # Sunday start
    weeks = cal_obj.monthdayscalendar(cal_year, cal_month)

    for week in weeks:
        week_html = '<div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-bottom:4px;">'
        for day_num in week:
            if day_num == 0:
                week_html += '<div style="min-height:90px;"></div>'
            else:
                date_key = f"{cal_year}-{cal_month:02d}-{day_num:02d}"
                pnl = daily_pnl.get(date_key, None)
                count = daily_count.get(date_key, 0)
                dollar = daily_dollar.get(date_key, 0)

                is_today = (
                    cal_year == today.year
                    and cal_month == today.month
                    and day_num == today.day
                )
                has_journal = date_key in journal_dates
                mental = journal_scores.get(date_key)

                # Determine cell colors
                if pnl is not None and count > 0:
                    if pnl > 0:
                        bg = "rgba(34,197,94,0.12)"
                        border_c = "#22c55e44"
                        val_color = "#22c55e"
                    elif pnl < 0:
                        bg = "rgba(239,68,68,0.12)"
                        border_c = "#ef444444"
                        val_color = "#ef4444"
                    else:
                        bg = "rgba(160,160,160,0.08)"
                        border_c = "#a0a0a033"
                        val_color = "#888"
                else:
                    bg = "#0e0e0e"
                    border_c = "#1e1a17"
                    val_color = None

                # Today gets purple/blue border
                if is_today:
                    border_style = "border:2px solid #7c5ce7;"
                else:
                    border_style = f"border:1px solid {border_c};"

                # Build cell content
                cell = (
                    f'<div style="background:{bg}; {border_style} border-radius:8px; '
                    f'padding:8px 6px; min-height:90px; text-align:center; position:relative;">'
                )

                # Day number
                day_color = "#f5f5f5" if is_today else "#888" if val_color else "#555"
                cell += f'<div style="font-size:0.8rem; color:{day_color}; font-weight:{"600" if is_today else "400"}; margin-bottom:4px;">{day_num}</div>'

                if val_color and count > 0:
                    # P&L value
                    cell += f'<div style="color:{val_color}; font-weight:700; font-size:1.1rem;">{pnl:+.0f}</div>'
                    # Dollar value
                    if dollar:
                        cell += f'<div style="color:{val_color}; font-size:0.6rem; opacity:0.8;">${dollar:+,.0f}</div>'
                    # Trade count
                    cell += f'<div style="color:#666; font-size:0.6rem; margin-top:2px;">{count} trade{"s" if count != 1 else ""}</div>'

                # Bottom indicators
                indicators = []
                if mental is not None:
                    # Mental score dot (color based on score)
                    m_col = "#22c55e" if mental >= 7 else "#e8651a" if mental >= 4 else "#ef4444"
                    indicators.append(
                        f'<span title="Mental: {mental}/10" style="display:inline-block; '
                        f'width:7px; height:7px; border-radius:50%; background:{m_col};"></span>'
                    )
                if has_journal:
                    indicators.append(
                        '<span title="Journal entry" style="display:inline-block; '
                        'color:#e8651a; font-size:0.6rem;">&#9998;</span>'
                    )

                if indicators:
                    cell += (
                        '<div style="position:absolute; bottom:4px; left:0; right:0; '
                        'text-align:center; display:flex; justify-content:center; gap:4px;">'
                        + "".join(indicators)
                        + '</div>'
                    )

                cell += '</div>'
                week_html += cell

        week_html += '</div>'
        st.markdown(week_html, unsafe_allow_html=True)

    # ── Legend ───────────────────────────────────────────────────
    legend_html = (
        '<div style="display:flex; gap:20px; justify-content:center; padding:12px 0; '
        'flex-wrap:wrap; margin-top:4px;">'
        # Profit
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<div style="width:12px; height:12px; border-radius:3px; background:rgba(34,197,94,0.3); '
        'border:1px solid #22c55e;"></div>'
        '<span style="color:#888; font-size:0.75rem;">Profit</span></div>'
        # Loss
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<div style="width:12px; height:12px; border-radius:3px; background:rgba(239,68,68,0.3); '
        'border:1px solid #ef4444;"></div>'
        '<span style="color:#888; font-size:0.75rem;">Loss</span></div>'
        # Mental Score
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<div style="width:8px; height:8px; border-radius:50%; background:#e8651a;"></div>'
        '<span style="color:#888; font-size:0.75rem;">Mental Score</span></div>'
        # Journal Entry
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<span style="color:#e8651a; font-size:0.8rem;">&#9998;</span>'
        '<span style="color:#888; font-size:0.75rem;">Journal Entry</span></div>'
        # Today
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<div style="width:12px; height:12px; border-radius:3px; border:2px solid #7c5ce7;"></div>'
        '<span style="color:#888; font-size:0.75rem;">Today</span></div>'
        '</div>'
    )
    st.markdown(legend_html, unsafe_allow_html=True)
