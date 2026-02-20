"""
Shared Trading Calendar component for Dashboard and Performance pages.
Renders a full-month P&L calendar matching The Chamber design:
  - "Trading Calendar" header with subtitle
  - Stat cards row (Monthly P&L, Total Trades, Trading Days, Winning Days, Losing Days, Win Rate)
  - Prev / Month Year / Today / Next navigation
  - Sun–Sat full month grid — each day IS a styled button; clicking opens a dialog
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


# ── Dialog for day detail (must be defined at module level) ────
@st.dialog("Day Detail", width="large")
def _show_day_dialog(date_str: str, trades: list, key_prefix: str):
    """Popup dialog showing day stats, trade list, and AI advice buttons."""

    # Parse date for display
    parts = date_str.split("-")
    display_date = f"{cal_module.month_name[int(parts[1])]} {int(parts[2])}, {parts[0]}"

    st.markdown(
        f'<div style="color:#f5f5f5; font-size:1.3rem; font-weight:700; margin-bottom:8px;">'
        f'{display_date}</div>',
        unsafe_allow_html=True,
    )

    # ── Day stats ──────────────────────────────────────────────
    day_wins = [t for t in trades if t.pnl_pips > 0]
    day_losses = [t for t in trades if t.pnl_pips < 0]
    day_total_pips = sum(t.pnl_pips for t in trades)
    day_total_dollar = sum(t.pnl_dollar for t in trades if t.pnl_dollar)
    day_wr = len(day_wins) / len(trades) * 100 if trades else 0
    day_pnl_color = "#22c55e" if day_total_pips > 0 else "#ef4444" if day_total_pips < 0 else "#888"

    # Profit factor
    gross_win = sum(t.pnl_pips for t in day_wins)
    gross_loss = abs(sum(t.pnl_pips for t in day_losses))
    pf = gross_win / gross_loss if gross_loss > 0 else float("inf")
    pf_str = f"{pf:.2f}" if pf != float("inf") else "—"
    pf_color = "#22c55e" if pf > 1.5 else "#e8651a" if pf > 1 else "#ef4444"

    # Avg RR
    avg_win = gross_win / len(day_wins) if day_wins else 0
    avg_loss = abs(sum(t.pnl_pips for t in day_losses) / len(day_losses)) if day_losses else 0
    rr = avg_win / avg_loss if avg_loss > 0 else 0
    rr_str = f"{rr:.2f}" if rr > 0 else "—"

    stats_html = '<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin:8px 0 16px 0;">'
    stats_html += _stat_card(
        "Day P&L",
        f"-${abs(day_total_dollar):,.2f}" if day_total_dollar and day_total_dollar < 0 else f"${day_total_dollar:,.2f}" if day_total_dollar else f"{day_total_pips:.1f}p",
        day_pnl_color,
        f"{day_total_pips:.1f} pips" if day_total_dollar else "",
    )
    stats_html += _stat_card("Trades", str(len(trades)), "#f5f5f5", f"{len(day_wins)}W / {len(day_losses)}L")
    stats_html += _stat_card(
        "Win Rate",
        f"{day_wr:.0f}%",
        "#22c55e" if day_wr >= 55 else "#e8651a" if day_wr >= 45 else "#ef4444",
    )
    stats_html += _stat_card("Profit Factor", pf_str, pf_color)
    stats_html += _stat_card("Avg R:R", rr_str, "#22c55e" if rr >= 2 else "#e8651a" if rr >= 1 else "#ef4444")
    stats_html += '</div>'
    st.markdown(stats_html, unsafe_allow_html=True)

    # ── Trade list ─────────────────────────────────────────────
    st.markdown(
        '<div style="color:#f5f5f5; font-size:1rem; font-weight:600; margin-bottom:8px;">Trades</div>',
        unsafe_allow_html=True,
    )

    for i, t in enumerate(trades):
        pnl_color = "#22c55e" if t.pnl_pips > 0 else "#ef4444" if t.pnl_pips < 0 else "#888"
        result_tag = "WIN" if t.pnl_pips > 0 else "LOSS" if t.pnl_pips < 0 else "BE"
        result_bg = "rgba(34,197,94,0.15)" if t.pnl_pips > 0 else "rgba(239,68,68,0.15)" if t.pnl_pips < 0 else "rgba(160,160,160,0.1)"
        dollar_str = f"-${abs(t.pnl_dollar):,.2f}" if t.pnl_dollar and t.pnl_dollar < 0 else f"${t.pnl_dollar:,.2f}" if t.pnl_dollar else ""
        reasoning_str = t.reasoning[:80] + "..." if t.reasoning and len(t.reasoning) > 80 else (t.reasoning or "")

        trade_html = (
            f'<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
            f'padding:12px 14px; margin-bottom:6px;">'
            # Top row: pair + direction + result badge
            f'<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">'
            f'<div style="display:flex; align-items:center; gap:8px;">'
            f'<span style="color:#f5f5f5; font-weight:700; font-size:1rem;">{t.pair}</span>'
            f'<span style="color:#888; font-size:0.8rem; text-transform:uppercase;">{t.direction}</span>'
            f'<span style="background:{result_bg}; color:{pnl_color}; font-size:0.7rem; font-weight:600; '
            f'padding:2px 8px; border-radius:10px;">{result_tag}</span>'
            f'</div>'
            f'<div style="text-align:right;">'
            f'<span style="color:{pnl_color}; font-weight:700; font-size:1.1rem;">'
            f'{dollar_str if dollar_str else (f"-{abs(t.pnl_pips):.1f}p" if t.pnl_pips < 0 else f"{t.pnl_pips:.1f}p")}</span>'
            f'</div>'
            f'</div>'
            # Details row
            f'<div style="display:flex; gap:16px; color:#666; font-size:0.75rem;">'
            f'<span>Entry: {t.entry_price}</span>'
            f'<span>Exit: {t.exit_price}</span>'
            f'<span>{t.pnl_pips:+.1f} pips</span>'
            f'</div>'
        )
        if reasoning_str:
            trade_html += (
                f'<div style="color:#888; font-size:0.75rem; margin-top:4px; font-style:italic;">'
                f'"{reasoning_str}"</div>'
            )
        trade_html += '</div>'
        st.markdown(trade_html, unsafe_allow_html=True)

        # AI Advice button for this trade
        if st.button(
            f"🔥 Get AI Advice",
            key=f"{key_prefix}_dlg_ai_{t.id}_{i}",
            use_container_width=True,
            type="tertiary",
        ):
            # Build a detailed question about this trade for the AI
            result_word = "winning" if t.pnl_pips > 0 else "losing" if t.pnl_pips < 0 else "breakeven"
            question = (
                f"Analyze my {result_word} {t.pair} {t.direction} trade from {t.trade_date}. "
                f"Entry: {t.entry_price}, Exit: {t.exit_price}, "
                f"Result: {t.pnl_pips:+.1f} pips"
                f"{f' (${t.pnl_dollar:+,.2f})' if t.pnl_dollar else ''}. "
            )
            if t.reasoning:
                question += f'My reasoning was: "{t.reasoning}". '

            if t.pnl_pips > 0:
                question += (
                    "What did I likely do right from an ICT perspective? "
                    "What should I keep being consistent with? "
                    "Any improvements I could still make?"
                )
            else:
                question += (
                    "What likely went wrong from an ICT perspective? "
                    "What specific ICT concepts should I review to improve? "
                    "What should I do differently next time?"
                )

            # Set up the AI ICT chat with this question
            st.session_state.ict_chat_messages = [{"role": "user", "content": question}]
            st.session_state["ict_trigger_response"] = True
            st.switch_page("pages/11_AI_ICT.py")


def _build_cell_label(day_num: int, count: int, dollar: float, pnl: float) -> str:
    """Build the text label shown on a clickable calendar cell button."""
    if count == 0:
        return str(day_num)

    # Line 1: day number — Line 2: dollar or pips — Line 3: trade count
    if dollar:
        dollar_display = f"-${abs(dollar):,.0f}" if dollar < 0 else f"${dollar:,.0f}"
    else:
        dollar_display = f"-{abs(pnl):.0f}p" if pnl < 0 else f"{pnl:.0f}p"

    trade_word = "trade" if count == 1 else "trades"
    return f"{day_num}\n{dollar_display}\n{count} {trade_word}"


def render_trading_calendar(key_prefix: str = "tcal", user_id: int = 1) -> None:
    """Render the full Trading Calendar component."""
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
    daily_trades: dict[str, list] = defaultdict(list)
    for t in month_trades:
        daily_pnl[t.trade_date] += t.pnl_pips
        daily_count[t.trade_date] += 1
        if t.pnl_dollar:
            daily_dollar[t.trade_date] += t.pnl_dollar
        daily_trades[t.trade_date].append(t)

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
        '<div style="color:#888; font-size:0.85rem;">Click a trading day to see details</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Stat cards row ──────────────────────────────────────────
    cards = '<div style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:12px 0 16px 0;">'
    cards += _stat_card(
        "Monthly P&L",
        f"-${abs(m_dollar):,.2f}" if m_dollar and m_dollar < 0 else f"${m_dollar:,.2f}" if m_dollar else f"{m_total:+.1f} pips",
        m_color,
        f"{m_total:.1f} pips" if m_dollar else "",
    )
    cards += _stat_card("Total Trades", str(len(month_trades)), "#f5f5f5")
    cards += _stat_card("Trading Days", str(len(trading_days)), "#e8651a")
    cards += _stat_card("Winning Days", str(len(winning_days)), "#22c55e")
    cards += _stat_card("Losing Days", str(len(losing_days)), "#ef4444")
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

    # ── Inject CSS to style buttons inside keyed containers ──────
    # Each day cell is wrapped in st.container(key="tcal_d_{day}").
    # Streamlit renders these as <div class="st-key-tcal_d_{day}">.
    # We target the button inside each keyed container.
    _inject_calendar_css(
        key_prefix, cal_year, cal_month, today,
        daily_pnl, daily_count, daily_dollar,
        journal_dates, journal_scores,
    )

    # ── Calendar grid (Sunday start) — each cell is a button ────
    cal_obj = cal_module.Calendar(firstweekday=6)  # Sunday start
    weeks = cal_obj.monthdayscalendar(cal_year, cal_month)

    for w_idx, week in enumerate(weeks):
        cols = st.columns(7, gap="small")
        for col_idx, day_num in enumerate(week):
            with cols[col_idx]:
                if day_num == 0:
                    # Empty cell for padding days
                    st.markdown(
                        '<div style="min-height:90px;"></div>',
                        unsafe_allow_html=True,
                    )
                else:
                    date_key = f"{cal_year}-{cal_month:02d}-{day_num:02d}"
                    count = daily_count.get(date_key, 0)
                    pnl = daily_pnl.get(date_key, 0)
                    dollar = daily_dollar.get(date_key, 0)

                    btn_label = _build_cell_label(day_num, count, dollar, pnl)
                    container_key = f"{key_prefix}_d_{day_num}"

                    # Wrap in a keyed container so CSS can target it
                    with st.container(key=container_key):
                        if count > 0:
                            # Clickable — opens dialog
                            if st.button(
                                btn_label,
                                key=f"{key_prefix}_btn_{day_num}",
                                use_container_width=True,
                            ):
                                _show_day_dialog(
                                    date_key,
                                    daily_trades[date_key],
                                    key_prefix,
                                )
                        else:
                            # Non-trading day — disabled appearance
                            st.button(
                                btn_label,
                                key=f"{key_prefix}_btn_{day_num}",
                                use_container_width=True,
                                disabled=True,
                            )

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


def _inject_calendar_css(
    key_prefix: str,
    cal_year: int,
    cal_month: int,
    today: date,
    daily_pnl: dict,
    daily_count: dict,
    daily_dollar: dict,
    journal_dates: set,
    journal_scores: dict,
) -> None:
    """Inject CSS to style each calendar cell button via its keyed container.

    Streamlit renders st.container(key="foo") as <div class="st-key-foo">.
    We target the button inside each container to set per-day colors.
    """
    _, last_day = cal_module.monthrange(cal_year, cal_month)

    css = "<style>\n"

    for day_num in range(1, last_day + 1):
        date_key = f"{cal_year}-{cal_month:02d}-{day_num:02d}"
        pnl = daily_pnl.get(date_key, None)
        count = daily_count.get(date_key, 0)
        is_today = (cal_year == today.year and cal_month == today.month and day_num == today.day)

        # Determine colors based on P&L
        if count > 0:
            if pnl and pnl > 0:
                bg = "rgba(34,197,94,0.12)"
                border_c = "rgba(34,197,94,0.27)"
                text_color = "#22c55e"
                hover_bg = "rgba(34,197,94,0.22)"
            elif pnl and pnl < 0:
                bg = "rgba(239,68,68,0.12)"
                border_c = "rgba(239,68,68,0.27)"
                text_color = "#ef4444"
                hover_bg = "rgba(239,68,68,0.22)"
            else:
                bg = "rgba(160,160,160,0.08)"
                border_c = "rgba(160,160,160,0.2)"
                text_color = "#888"
                hover_bg = "rgba(160,160,160,0.15)"
        else:
            bg = "#0e0e0e"
            border_c = "#1e1a17"
            text_color = "#555"
            hover_bg = "#141414"

        if is_today:
            border_rule = "border: 2px solid #7c5ce7 !important;"
        else:
            border_rule = f"border: 1px solid {border_c} !important;"

        # CSS class from st.container(key=...)
        container_cls = f"st-key-{key_prefix}_d_{day_num}"

        # Style the button inside this container
        css += f"""
.{container_cls} button {{
    background: {bg} !important;
    {border_rule}
    border-radius: 8px !important;
    color: {text_color} !important;
    min-height: 90px !important;
    height: 90px !important;
    padding: 6px 4px !important;
    font-weight: 700 !important;
    font-size: 0.85rem !important;
    white-space: pre-line !important;
    line-height: 1.3 !important;
    cursor: {"pointer" if count > 0 else "default"} !important;
    transition: background 0.15s ease !important;
}}
.{container_cls} button:hover {{
    background: {hover_bg} !important;
    {border_rule}
}}
"""
        # Disabled buttons (non-trading days) need opacity override
        if count == 0:
            css += f"""
.{container_cls} button:disabled {{
    background: {bg} !important;
    {border_rule}
    color: {text_color} !important;
    opacity: 1 !important;
    cursor: default !important;
}}
"""

    # Also hide the keyed container's own padding/border
    css += f"""
div[class*="st-key-{key_prefix}_d_"] {{
    padding: 0 !important;
    margin: 0 !important;
}}
"""

    css += "</style>"
    st.markdown(css, unsafe_allow_html=True)
