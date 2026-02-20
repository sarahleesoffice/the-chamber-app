import streamlit as st
from collections import defaultdict
from datetime import date, timedelta

from lib.database import (
    get_all_trades,
    get_trades_in_range,
    get_journals_in_range,
)
from lib.trading_calendar import render_trading_calendar
from lib.auth import get_current_user_id

st.header("Performance & Analytics")

user_id = get_current_user_id()

all_trades = get_all_trades(limit=5000, user_id=user_id)

# --- Time Range Selector ---
range_options = ["This Month", "Last Month", "This Week", "Last 30 Days", "Last 90 Days", "Year to Date", "All Time"]
selected_range = st.segmented_control("Period", range_options, default="This Month", key="perf_range")

today = date.today()

if selected_range == "This Month":
    start = today.replace(day=1)
    end = today
elif selected_range == "Last Month":
    first_of_this = today.replace(day=1)
    end = first_of_this - timedelta(days=1)
    start = end.replace(day=1)
elif selected_range == "This Week":
    start = today - timedelta(days=today.weekday())
    end = today
elif selected_range == "Last 30 Days":
    start = today - timedelta(days=30)
    end = today
elif selected_range == "Last 90 Days":
    start = today - timedelta(days=90)
    end = today
elif selected_range == "Year to Date":
    start = today.replace(month=1, day=1)
    end = today
else:  # All Time
    start = date(2020, 1, 1)
    end = today

start_str = start.strftime("%Y-%m-%d")
end_str = end.strftime("%Y-%m-%d")

trades = get_trades_in_range(start_str, end_str, user_id=user_id)

# ============================================================
# COMPUTE STATS (safe for empty trades)
# ============================================================
total_pips = sum(t.pnl_pips for t in trades) if trades else 0
total_dollar = sum(t.pnl_dollar for t in trades if t.pnl_dollar) if trades else 0
winners = [t for t in trades if t.pnl_pips > 0] if trades else []
losers = [t for t in trades if t.pnl_pips < 0] if trades else []
breakeven = [t for t in trades if t.pnl_pips == 0] if trades else []
win_rate = len(winners) / len(trades) * 100 if trades else 0
avg_win = sum(t.pnl_pips for t in winners) / len(winners) if winners else 0
avg_loss = sum(t.pnl_pips for t in losers) / len(losers) if losers else 0
profit_factor = abs(sum(t.pnl_pips for t in winners) / sum(t.pnl_pips for t in losers)) if losers and sum(t.pnl_pips for t in losers) != 0 else float("inf")
rr_ratio = abs(avg_win / avg_loss) if avg_loss != 0 else 0
best_trade = max(trades, key=lambda t: t.pnl_pips) if trades else None
worst_trade = min(trades, key=lambda t: t.pnl_pips) if trades else None

# Trading days
trading_days = set(t.trade_date for t in trades) if trades else set()
winning_days = set()
losing_days = set()
for d in trading_days:
    day_pnl = sum(t.pnl_pips for t in trades if t.trade_date == d)
    if day_pnl > 0:
        winning_days.add(d)
    elif day_pnl < 0:
        losing_days.add(d)

# ============================================================
# STATS OVERVIEW CARDS (styled)
# ============================================================

pnl_color = "#22c55e" if total_pips > 0 else "#ef4444" if total_pips < 0 else "#a0a0a0"
wr_color = "#22c55e" if win_rate >= 55 else "#e8651a" if win_rate >= 45 else "#ef4444"
pf_val = f"{profit_factor:.2f}" if profit_factor != float("inf") else "—"
rr_val = f"{rr_ratio:.2f}" if rr_ratio > 0 else "—"

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

# Row 1: Key metrics
stats_row1 = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:8px;">'
stats_row1 += stat_card("Net P&L", f"{total_pips:+.1f} pips" if trades else "—", pnl_color,
                        f"${total_dollar:+,.2f}" if total_dollar else "")
stats_row1 += stat_card("Win Rate", f"{win_rate:.1f}%" if trades else "—", wr_color,
                        (f"{len(winners)}W / {len(losers)}L" + (f" / {len(breakeven)}BE" if breakeven else "")) if trades else "No trades yet")
stats_row1 += stat_card("Profit Factor", pf_val,
                        "#22c55e" if profit_factor > 1.5 else "#e8651a" if profit_factor > 1 else "#ef4444")
stats_row1 += stat_card("R:R Ratio", rr_val,
                        "#22c55e" if rr_ratio >= 2 else "#e8651a" if rr_ratio >= 1 else "#ef4444")
stats_row1 += '</div>'
st.markdown(stats_row1, unsafe_allow_html=True)

# Row 2: Detailed metrics
stats_row2 = '<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:8px;">'
stats_row2 += stat_card("Trades", str(len(trades)), "#f5f5f5",
                        f"{len(trading_days)} days" if trades else "")
stats_row2 += stat_card("Avg Win", f"{avg_win:+.1f}" if winners else "—", "#22c55e")
stats_row2 += stat_card("Avg Loss", f"{avg_loss:+.1f}" if losers else "—", "#ef4444")
stats_row2 += stat_card("Best Trade", f"{best_trade.pnl_pips:+.1f}" if best_trade else "—", "#22c55e",
                        best_trade.pair if best_trade else "")
stats_row2 += stat_card("Worst Trade", f"{worst_trade.pnl_pips:+.1f}" if worst_trade else "—", "#ef4444",
                        worst_trade.pair if worst_trade else "")
stats_row2 += '</div>'
st.markdown(stats_row2, unsafe_allow_html=True)

st.write("")

# ============================================================
# WIN RATE DONUT + QUICK STATS (side by side)
# ============================================================

donut_col, stats_col = st.columns([1, 2])

with donut_col:
    # SVG donut chart for Win Rate
    win_pct = win_rate / 100
    loss_pct = len(losers) / len(trades) if trades else 0
    be_pct = len(breakeven) / len(trades) if trades else 0

    circumference = 2 * 3.14159 * 45  # radius = 45
    win_dash = win_pct * circumference
    loss_dash = loss_pct * circumference

    loss_offset = -(win_dash)

    center_text = f"{win_rate:.0f}%" if trades else "—"
    center_color = wr_color if trades else "#888"

    donut_svg = f'''
    <div style="text-align:center; padding:12px;">
        <svg viewBox="0 0 120 120" width="200" height="200">
            <!-- Background circle -->
            <circle cx="60" cy="60" r="45" fill="none" stroke="#1e1a17" stroke-width="12"/>
            <!-- Win segment (green) -->
            <circle cx="60" cy="60" r="45" fill="none" stroke="#22c55e" stroke-width="12"
                    stroke-dasharray="{win_dash} {circumference}" stroke-dashoffset="0"
                    transform="rotate(-90 60 60)" stroke-linecap="round"/>
            <!-- Loss segment (red) -->
            <circle cx="60" cy="60" r="45" fill="none" stroke="#ef4444" stroke-width="12"
                    stroke-dasharray="{loss_dash} {circumference}" stroke-dashoffset="{loss_offset}"
                    transform="rotate(-90 60 60)" stroke-linecap="round"/>
            <!-- Center text -->
            <text x="60" y="55" text-anchor="middle" fill="{center_color}" font-size="18" font-weight="700">{center_text}</text>
            <text x="60" y="72" text-anchor="middle" fill="#888" font-size="8">WIN RATE</text>
        </svg>
        <div style="display:flex; justify-content:center; gap:16px; margin-top:8px;">
            <span style="color:#22c55e; font-size:0.8rem;">&#9679; {len(winners)} Wins</span>
            <span style="color:#ef4444; font-size:0.8rem;">&#9679; {len(losers)} Losses</span>
            {f'<span style="color:#888; font-size:0.8rem;">&#9679; {len(breakeven)} BE</span>' if breakeven else ""}
        </div>
    </div>
    '''
    st.markdown(donut_svg, unsafe_allow_html=True)

with stats_col:
    # Day performance breakdown
    st.markdown("**Day Performance**")

    day_data = '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">'
    day_data += stat_card("Winning Days", str(len(winning_days)), "#22c55e")
    day_data += stat_card("Losing Days", str(len(losing_days)), "#ef4444")
    day_data += stat_card("Total Days", str(len(trading_days)), "#f5f5f5")
    day_data += '</div>'
    st.markdown(day_data, unsafe_allow_html=True)

    st.write("")

    # Avg trades per day
    avg_trades_per_day = len(trades) / len(trading_days) if trading_days else 0
    avg_pips_per_day = total_pips / len(trading_days) if trading_days else 0
    day_wr = len(winning_days) / len(trading_days) * 100 if trading_days else 0

    day_data2 = '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">'
    day_data2 += stat_card("Avg Trades/Day", f"{avg_trades_per_day:.1f}", "#e8651a")
    day_data2 += stat_card("Avg Pips/Day", f"{avg_pips_per_day:+.1f}" if trades else "—",
                           "#22c55e" if avg_pips_per_day > 0 else "#ef4444")
    day_data2 += stat_card("Day Win Rate", f"{day_wr:.0f}%" if trades else "—",
                           "#22c55e" if day_wr >= 55 else "#e8651a" if day_wr >= 45 else "#ef4444")
    day_data2 += '</div>'
    st.markdown(day_data2, unsafe_allow_html=True)

st.divider()

# ============================================================
# TABS
# ============================================================
tab_calendar, tab_equity, tab_breakdown, tab_streaks, tab_mental = st.tabs([
    "Calendar", "Equity Curve", "Breakdowns", "Streaks", "Mental Correlation",
])

# ============================================================
# CALENDAR TAB
# ============================================================
with tab_calendar:
    render_trading_calendar(key_prefix="perf_tcal", user_id=user_id)

# ============================================================
# EQUITY CURVE TAB
# ============================================================
with tab_equity:
    st.subheader("Equity Curve")

    if trades:
        sorted_trades = sorted(trades, key=lambda t: (t.trade_date, t.id))
        cumulative = []
        running = 0.0
        for t in sorted_trades:
            running += t.pnl_pips
            cumulative.append({"date": t.trade_date, "cumulative_pips": running})

        if cumulative:
            st.line_chart(
                data={c["date"]: c["cumulative_pips"] for c in cumulative},
                color="#e8651a",
            )

        # Drawdown
        peak = 0.0
        max_dd = 0.0
        running = 0.0
        for t in sorted_trades:
            running += t.pnl_pips
            if running > peak:
                peak = running
            dd = peak - running
            if dd > max_dd:
                max_dd = dd

        dd_html = '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">'
        dd_html += stat_card("Peak P&L", f"{peak:+.1f} pips", "#22c55e")
        dd_html += stat_card("Max Drawdown", f"{max_dd:.1f} pips", "#ef4444")
        dd_html += stat_card("Current P&L", f"{running:+.1f} pips",
                             "#22c55e" if running > 0 else "#ef4444")
        dd_html += '</div>'
        st.markdown(dd_html, unsafe_allow_html=True)
    else:
        st.markdown(
            '<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
            'padding:40px; text-align:center; color:#666; font-size:0.9rem;">'
            'Your equity curve will appear here once you log trades.'
            '</div>',
            unsafe_allow_html=True,
        )

# ============================================================
# BREAKDOWNS TAB
# ============================================================
with tab_breakdown:
    st.subheader("Performance Breakdowns")

    if trades:
        breakdown_type = st.segmented_control(
            "Break down by",
            ["Pair", "Direction", "Day of Week"],
            default="Pair",
            key="breakdown_type",
        )

        def show_breakdown(groups: dict[str, list]):
            for name, group_trades in sorted(groups.items(), key=lambda x: sum(t.pnl_pips for t in x[1]), reverse=True):
                g_pnl = sum(t.pnl_pips for t in group_trades)
                g_wins = sum(1 for t in group_trades if t.pnl_pips > 0)
                g_wr = g_wins / len(group_trades) * 100 if group_trades else 0
                g_avg = g_pnl / len(group_trades) if group_trades else 0

                color = "#22c55e" if g_pnl > 0 else "#ef4444" if g_pnl < 0 else "#888"

                with st.expander(f"**{name}** — {g_pnl:+.1f} pips ({len(group_trades)} trades)"):
                    row_html = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">'
                    row_html += stat_card("P&L", f"{g_pnl:+.1f}", color)
                    row_html += stat_card("Trades", str(len(group_trades)), "#f5f5f5")
                    row_html += stat_card("Win Rate", f"{g_wr:.0f}%",
                                          "#22c55e" if g_wr >= 55 else "#e8651a" if g_wr >= 45 else "#ef4444")
                    row_html += stat_card("Avg P&L", f"{g_avg:+.1f}",
                                          "#22c55e" if g_avg > 0 else "#ef4444")
                    row_html += '</div>'
                    st.markdown(row_html, unsafe_allow_html=True)

        if breakdown_type == "Pair":
            groups = defaultdict(list)
            for t in trades:
                groups[t.pair].append(t)
            show_breakdown(groups)

        elif breakdown_type == "Direction":
            groups = defaultdict(list)
            for t in trades:
                groups[t.direction.upper()].append(t)
            show_breakdown(groups)

        elif breakdown_type == "Day of Week":
            from datetime import datetime as dt
            day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
            groups = defaultdict(list)
            for t in trades:
                try:
                    d = dt.strptime(t.trade_date, "%Y-%m-%d")
                    groups[day_names[d.weekday()]].append(t)
                except ValueError:
                    groups["Unknown"].append(t)
            # Sort by day order
            ordered = {}
            for day in day_names:
                if day in groups:
                    ordered[day] = groups[day]
            show_breakdown(ordered)
    else:
        st.markdown(
            '<div style="background:#141414; border:1px solid #1e1a17; border-radius:8px; '
            'padding:40px; text-align:center; color:#666; font-size:0.9rem;">'
            'Log trades to see performance breakdowns by pair, direction, and day of week.'
            '</div>',
            unsafe_allow_html=True,
        )

# ============================================================
# STREAKS TAB
# ============================================================
with tab_streaks:
    st.subheader("Win/Loss Streaks")

    if trades:
        sorted_trades = sorted(trades, key=lambda t: (t.trade_date, t.id))

        # Calculate streaks
        current_streak = 0
        current_type = None
        max_win_streak = 0
        max_loss_streak = 0
        streaks = []

        for t in sorted_trades:
            if t.pnl_pips > 0:
                if current_type == "win":
                    current_streak += 1
                else:
                    if current_streak > 0:
                        streaks.append((current_type, current_streak))
                    current_type = "win"
                    current_streak = 1
                max_win_streak = max(max_win_streak, current_streak)
            elif t.pnl_pips < 0:
                if current_type == "loss":
                    current_streak += 1
                else:
                    if current_streak > 0:
                        streaks.append((current_type, current_streak))
                    current_type = "loss"
                    current_streak = 1
                max_loss_streak = max(max_loss_streak, current_streak)

        if current_streak > 0:
            streaks.append((current_type, current_streak))

        streak_html = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">'
        streak_html += stat_card("Best Win Streak", str(max_win_streak), "#22c55e")
        streak_html += stat_card("Worst Loss Streak", str(max_loss_streak), "#ef4444")
        current_label = f"{current_streak} {'W' if current_type == 'win' else 'L'}" if current_type else "—"
        current_color = "#22c55e" if current_type == "win" else "#ef4444" if current_type == "loss" else "#888"
        streak_html += stat_card("Current Streak", current_label, current_color)

        w_days = len(winning_days)
        total_d = len(trading_days)
        streak_html += stat_card("Win Days / Total", f"{w_days}/{total_d}", "#e8651a")
        streak_html += '</div>'
        st.markdown(streak_html, unsafe_allow_html=True)

        # Daily streaks
        st.divider()
        st.markdown("**Daily P&L Streak**")

        sorted_dates = sorted(trading_days)
        day_streak = 0
        day_type = None
        max_day_win = 0
        max_day_loss = 0

        for d in sorted_dates:
            day_pnl_val = sum(t.pnl_pips for t in trades if t.trade_date == d)
            if day_pnl_val > 0:
                if day_type == "win":
                    day_streak += 1
                else:
                    day_type = "win"
                    day_streak = 1
                max_day_win = max(max_day_win, day_streak)
            elif day_pnl_val < 0:
                if day_type == "loss":
                    day_streak += 1
                else:
                    day_type = "loss"
                    day_streak = 1
                max_day_loss = max(max_day_loss, day_streak)

        ds_html = '<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">'
        ds_html += stat_card("Best Green Day Streak", str(max_day_win), "#22c55e")
        ds_html += stat_card("Worst Red Day Streak", str(max_day_loss), "#ef4444")
        ds_label = f"{day_streak} {'green' if day_type == 'win' else 'red'}" if day_type else "—"
        ds_color = "#22c55e" if day_type == "win" else "#ef4444" if day_type == "loss" else "#888"
        ds_html += stat_card("Current Day Streak", ds_label, ds_color)
        ds_html += '</div>'
        st.markdown(ds_html, unsafe_allow_html=True)
    else:
        streak_html = '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">'
        streak_html += stat_card("Best Win Streak", "0", "#888")
        streak_html += stat_card("Worst Loss Streak", "0", "#888")
        streak_html += stat_card("Current Streak", "—", "#888")
        streak_html += stat_card("Win Days / Total", "0/0", "#888")
        streak_html += '</div>'
        st.markdown(streak_html, unsafe_allow_html=True)

# ============================================================
# MENTAL CORRELATION TAB
# ============================================================
with tab_mental:
    st.subheader("Mental State vs Performance")

    journals = get_journals_in_range(start_str, end_str, user_id=user_id)

    if not journals:
        st.info("No journal entries found for this period. Fill out Daily Journal entries to see mental state correlations.")
    elif not trades:
        st.info("No trades found for this period. Log trades to see how your mental state correlates with performance.")
    else:
        # Match journals to daily P&L
        journal_map = {j.journal_date: j for j in journals}
        correlations = []

        for d in trading_days:
            if d in journal_map:
                j = journal_map[d]
                day_pnl_val = sum(t.pnl_pips for t in trades if t.trade_date == d)
                day_count = sum(1 for t in trades if t.trade_date == d)
                day_wins = sum(1 for t in trades if t.trade_date == d and t.pnl_pips > 0)
                correlations.append({
                    "date": d,
                    "pnl": day_pnl_val,
                    "trades": day_count,
                    "win_rate": day_wins / day_count * 100 if day_count else 0,
                    "readiness": j.readiness_score,
                    "sleep": j.sleep,
                    "energy": j.energy,
                    "focus": j.focus,
                    "mood": j.mood,
                    "stress": j.stress,
                    "confidence": j.confidence,
                })

        if correlations:
            st.caption(f"Analyzing {len(correlations)} trading days with journal entries")

            # Readiness correlation
            high_ready = [c for c in correlations if c["readiness"] >= 7]
            low_ready = [c for c in correlations if c["readiness"] <= 4]

            if high_ready and low_ready:
                hr_avg = sum(c["pnl"] for c in high_ready) / len(high_ready)
                lr_avg = sum(c["pnl"] for c in low_ready) / len(low_ready)
                hr_wr = sum(c["win_rate"] for c in high_ready) / len(high_ready)
                lr_wr = sum(c["win_rate"] for c in low_ready) / len(low_ready)

                comp_html = '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">'
                comp_html += (
                    f'<div style="background:#141414; border:1px solid #22c55e33; border-radius:8px; padding:16px;">'
                    f'<div style="color:#22c55e; font-weight:700; margin-bottom:8px;">High Readiness Days (7+)</div>'
                )
                comp_html += f'<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">'
                comp_html += stat_card("Avg P&L", f"{hr_avg:+.1f}", "#22c55e")
                comp_html += stat_card("Avg WR", f"{hr_wr:.0f}%", "#22c55e")
                comp_html += stat_card("Days", str(len(high_ready)), "#f5f5f5")
                comp_html += '</div></div>'

                comp_html += (
                    f'<div style="background:#141414; border:1px solid #ef444433; border-radius:8px; padding:16px;">'
                    f'<div style="color:#ef4444; font-weight:700; margin-bottom:8px;">Low Readiness Days (4-)</div>'
                )
                comp_html += f'<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px;">'
                comp_html += stat_card("Avg P&L", f"{lr_avg:+.1f}", "#ef4444")
                comp_html += stat_card("Avg WR", f"{lr_wr:.0f}%", "#ef4444")
                comp_html += stat_card("Days", str(len(low_ready)), "#f5f5f5")
                comp_html += '</div></div>'
                comp_html += '</div>'
                st.markdown(comp_html, unsafe_allow_html=True)

            st.divider()

            # Per-category breakdown
            st.markdown("**Performance by Mental State Category**")
            for cat in ["sleep", "energy", "focus", "mood", "stress", "confidence"]:
                high = [c for c in correlations if c[cat] >= 7]
                low = [c for c in correlations if c[cat] <= 4]
                if high and low:
                    h_pnl = sum(c["pnl"] for c in high) / len(high)
                    l_pnl = sum(c["pnl"] for c in low) / len(low)
                    diff = h_pnl - l_pnl
                    color = "#22c55e" if diff > 0 else "#ef4444"
                    st.markdown(
                        f"**{cat.title()}**: High ({len(high)}d) avg {h_pnl:+.1f} pips vs "
                        f"Low ({len(low)}d) avg {l_pnl:+.1f} pips — "
                        f'<span style="color:{color}">difference: {diff:+.1f} pips/day</span>',
                        unsafe_allow_html=True,
                    )
        else:
            st.info("No overlap between journal entries and trading days found. Make sure to fill journal entries on days you trade.")
