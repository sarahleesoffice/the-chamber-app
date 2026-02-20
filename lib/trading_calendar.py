"""
Shared Trading Calendar component for Dashboard and Performance pages.
Renders a full-month P&L calendar matching The Chamber design:
  - "Trading Calendar" header with subtitle
  - Stat cards row (Monthly P&L, Total Trades, Trading Days, Winning Days, Losing Days, Win Rate)
  - Prev / Month Year / Today / Next navigation
  - Sun–Sat full month grid with large cells
  - Clickable day cells → detail panel with trade list + AI advice links
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
    selected_key = f"{key_prefix}_selected_date"

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
        '<div style="color:#888; font-size:0.85rem;">Review your trading performance by date</div>'
        '</div>',
        unsafe_allow_html=True,
    )

    # ── Stat cards row ──────────────────────────────────────────
    cards = '<div style="display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin:12px 0 16px 0;">'
    cards += _stat_card(
        "Monthly P&L",
        f"${m_dollar:+,.2f}" if m_dollar else f"{m_total:+.1f} pips",
        m_color,
        f"{m_total:+.1f} pips" if m_dollar else "",
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
            # Clear selected date when navigating months
            if selected_key in st.session_state:
                del st.session_state[selected_key]
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
            if selected_key in st.session_state:
                del st.session_state[selected_key]
            st.rerun()

    with nav4:
        if st.button("Next >", key=f"{key_prefix}_next"):
            if st.session_state[month_key] == 12:
                st.session_state[month_key] = 1
                st.session_state[year_key] += 1
            else:
                st.session_state[month_key] += 1
            if selected_key in st.session_state:
                del st.session_state[selected_key]
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

    # Get currently selected date
    current_selected = st.session_state.get(selected_key)

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
                is_selected = current_selected == date_key
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

                # Border: selected > today > default
                if is_selected:
                    border_style = "border:2px solid #e8651a;"
                elif is_today:
                    border_style = "border:2px solid #7c5ce7;"
                else:
                    border_style = f"border:1px solid {border_c};"

                # Cursor style for clickable days
                cursor = "cursor:pointer;" if count > 0 else ""

                # Build cell content
                cell = (
                    f'<div style="background:{bg}; {border_style} border-radius:8px; '
                    f'padding:8px 6px; min-height:90px; text-align:center; position:relative; {cursor}">'
                )

                # Day number
                day_color = "#e8651a" if is_selected else "#f5f5f5" if is_today else "#888" if val_color else "#555"
                cell += f'<div style="font-size:0.8rem; color:{day_color}; font-weight:{"600" if is_today or is_selected else "400"}; margin-bottom:4px;">{day_num}</div>'

                if val_color and count > 0:
                    # Dollar P&L (primary display)
                    if dollar:
                        cell += f'<div style="color:{val_color}; font-weight:700; font-size:1.1rem;">${dollar:+,.0f}</div>'
                    else:
                        # Fallback to pips if no dollar data
                        cell += f'<div style="color:{val_color}; font-weight:700; font-size:1.1rem;">{pnl:+.0f}p</div>'
                    # Trade count
                    cell += f'<div style="color:#666; font-size:0.65rem; margin-top:2px;">{count} trade{"s" if count != 1 else ""}</div>'

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

    # ── Clickable day buttons (hidden grid matching calendar) ───
    # Use Streamlit buttons in a matching 7-column grid for each week
    for week in weeks:
        btn_cols = st.columns(7)
        for col_idx, day_num in enumerate(week):
            if day_num == 0:
                continue
            date_key = f"{cal_year}-{cal_month:02d}-{day_num:02d}"
            count = daily_count.get(date_key, 0)
            if count > 0:
                with btn_cols[col_idx]:
                    if st.button(
                        f"📊 {day_num}",
                        key=f"{key_prefix}_day_{day_num}",
                        use_container_width=True,
                        type="tertiary",
                    ):
                        if current_selected == date_key:
                            # Toggle off if already selected
                            if selected_key in st.session_state:
                                del st.session_state[selected_key]
                        else:
                            st.session_state[selected_key] = date_key
                        st.rerun()

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
        # Selected
        '<div style="display:flex; align-items:center; gap:5px;">'
        '<div style="width:12px; height:12px; border-radius:3px; border:2px solid #e8651a;"></div>'
        '<span style="color:#888; font-size:0.75rem;">Selected</span></div>'
        '</div>'
    )
    st.markdown(legend_html, unsafe_allow_html=True)

    # ── Day Detail Panel ────────────────────────────────────────
    if current_selected and current_selected in daily_trades:
        _render_day_detail(current_selected, daily_trades[current_selected], key_prefix)


def _render_day_detail(date_str: str, trades: list, key_prefix: str) -> None:
    """Render the detail panel for a selected day with stats + trade list + AI advice buttons."""

    st.divider()

    # Parse date for display
    parts = date_str.split("-")
    display_date = f"{cal_module.month_name[int(parts[1])]} {int(parts[2])}, {parts[0]}"

    st.markdown(
        f'<div style="color:#f5f5f5; font-size:1.2rem; font-weight:700; margin-bottom:4px;">'
        f'📅 {display_date}</div>',
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
        f"${day_total_dollar:+,.2f}" if day_total_dollar else f"{day_total_pips:+.1f}p",
        day_pnl_color,
        f"{day_total_pips:+.1f} pips" if day_total_dollar else "",
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
        dollar_str = f"${t.pnl_dollar:+,.2f}" if t.pnl_dollar else ""
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
            f'{dollar_str if dollar_str else f"{t.pnl_pips:+.1f}p"}</span>'
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
            key=f"{key_prefix}_ai_{t.id}_{i}",
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
