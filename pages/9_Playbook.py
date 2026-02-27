import streamlit as st

from lib.auth import get_current_user_id
from lib.database import (
    get_all_playbooks,
    insert_playbook,
    delete_playbook,
    get_playbook,
    get_all_trades,
    get_grades_for_trade,
    upsert_trade_grade,
    get_all_grades,
    get_trade,
)
from lib.models import PlaybookSetup, TradeGrade
from lib.psychology_framework import ICT_SETUPS

# ── Live price ticker ──
try:
    from lib.ticker import render_ticker
    render_ticker()
except Exception:
    pass

user_id = get_current_user_id()

st.header("Playbook")
st.caption("Define your ICT setups with specific rules, then grade every trade against them.")

tab_setups, tab_grade, tab_stats = st.tabs(["My Setups", "Grade a Trade", "Compliance Stats"])

# ============================================================
# MY SETUPS TAB
# ============================================================
with tab_setups:
    st.subheader("Define Your Setups")

    playbooks = get_all_playbooks(user_id=user_id, active_only=False)

    # Create new setup
    with st.expander("**+ Create New Setup**", expanded=not playbooks):
        new_name = st.text_input("Setup Name", placeholder="e.g. London OB Reversal", key="pb_name")
        new_type = st.selectbox("Setup Type", ICT_SETUPS, key="pb_type")
        new_desc = st.text_area(
            "Description",
            placeholder="Describe when and how you take this setup...",
            key="pb_desc",
            height=80,
        )

        st.markdown("**Rules (one per line)**")
        new_rules = st.text_area(
            "Rules",
            placeholder="Wait for liquidity sweep first\nEntry on OB in discount zone\nMinimum 2:1 R:R\nOnly during London or NY kill zone\nStop behind the OB",
            key="pb_rules",
            height=120,
            label_visibility="collapsed",
        )

        if st.button("Save Setup", type="primary", key="pb_save"):
            if new_name and new_rules:
                # Convert newlines to comma-separated
                rules_csv = ",".join(r.strip() for r in new_rules.strip().split("\n") if r.strip())
                setup = PlaybookSetup(
                    name=new_name,
                    setup_type=new_type,
                    rules=rules_csv,
                    description=new_desc,
                )
                insert_playbook(setup, user_id=user_id)
                st.success(f"Setup '{new_name}' saved!")
                st.rerun()
            else:
                st.warning("Name and at least one rule are required.")

    # List existing setups
    if playbooks:
        for pb in playbooks:
            rules_list = [r.strip() for r in pb.rules.split(",") if r.strip()]
            with st.expander(f"**{pb.name}** — {pb.setup_type} ({len(rules_list)} rules)"):
                if pb.description:
                    st.markdown(f"*{pb.description}*")
                st.divider()
                st.markdown("**Rules:**")
                for i, rule in enumerate(rules_list, 1):
                    st.markdown(f"{i}. {rule}")
                st.divider()
                if st.button("Delete Setup", key=f"del_pb_{pb.id}", type="secondary"):
                    delete_playbook(pb.id, user_id=user_id)
                    st.rerun()

# ============================================================
# GRADE A TRADE TAB
# ============================================================
with tab_grade:
    st.subheader("Grade Trade Compliance")

    playbooks = get_all_playbooks(user_id=user_id)
    if not playbooks:
        st.info("Create a setup in the **My Setups** tab first.")
    else:
        trades = get_all_trades(limit=200, user_id=user_id)
        if not trades:
            st.info("No trades to grade. Log some trades first.")
        else:
            # Select trade
            trade_options = {
                t.id: f"#{t.id} | {t.pair} {t.direction.upper()} | {t.pnl_pips:+.1f} pips | {t.trade_date}"
                for t in trades
            }
            selected_trade_id = st.selectbox(
                "Select trade to grade",
                options=list(trade_options.keys()),
                format_func=lambda x: trade_options[x],
                key="grade_trade",
            )

            # Select playbook
            pb_options = {pb.id: f"{pb.name} ({pb.setup_type})" for pb in playbooks}
            selected_pb_id = st.selectbox(
                "Which setup was this trade?",
                options=list(pb_options.keys()),
                format_func=lambda x: pb_options[x],
                key="grade_pb",
            )

            pb = get_playbook(selected_pb_id, user_id=user_id)
            if pb:
                rules_list = [r.strip() for r in pb.rules.split(",") if r.strip()]

                st.divider()
                st.markdown(f"**Grading against: {pb.name}**")

                # Check existing grade
                existing_grades = get_grades_for_trade(selected_trade_id, user_id=user_id)
                existing = None
                for g in existing_grades:
                    if g.playbook_id == selected_pb_id:
                        existing = g
                        break

                existing_followed = existing.rules_followed.split(",") if existing and existing.rules_followed else []
                existing_broken = existing.rules_broken.split(",") if existing and existing.rules_broken else []

                followed = []
                broken = []

                for rule in rules_list:
                    # Default to followed if existing, else unchecked
                    default = rule in existing_followed if existing else False
                    col1, col2 = st.columns([4, 1])
                    with col1:
                        st.markdown(f"**{rule}**")
                    with col2:
                        result = st.selectbox(
                            "Status",
                            ["Followed", "Broken"],
                            index=0 if default or rule not in existing_broken else 1,
                            key=f"rule_{pb.id}_{rule}",
                            label_visibility="collapsed",
                        )
                    if result == "Followed":
                        followed.append(rule)
                    else:
                        broken.append(rule)

                compliance = len(followed) / len(rules_list) * 100 if rules_list else 0

                # Visual compliance
                if compliance >= 80:
                    color = "#ff7e33"
                elif compliance >= 50:
                    color = "#e8651a"
                else:
                    color = "#9e4a15"

                st.progress(compliance / 100)
                st.markdown(f'<span style="color:{color}; font-weight:700; font-size:1.2rem;">{compliance:.0f}% Compliance</span>', unsafe_allow_html=True)

                grade_notes = st.text_input("Notes", value=existing.notes if existing else "", key="grade_notes")

                if st.button("Save Grade", type="primary", key="save_grade"):
                    grade = TradeGrade(
                        trade_id=selected_trade_id,
                        playbook_id=selected_pb_id,
                        rules_followed=",".join(followed),
                        rules_broken=",".join(broken),
                        compliance_pct=compliance,
                        notes=grade_notes,
                    )
                    upsert_trade_grade(grade, user_id=user_id)
                    st.success(f"Grade saved! {compliance:.0f}% compliance")

# ============================================================
# COMPLIANCE STATS TAB
# ============================================================
with tab_stats:
    st.subheader("Compliance Overview")

    all_grades = get_all_grades(user_id=user_id)
    playbooks = get_all_playbooks(user_id=user_id, active_only=False)
    pb_map = {pb.id: pb for pb in playbooks}

    if not all_grades:
        st.info("No trades graded yet. Use the **Grade a Trade** tab to start.")
    else:
        # Overall stats
        avg_compliance = sum(g.compliance_pct for g in all_grades) / len(all_grades)
        perfect = sum(1 for g in all_grades if g.compliance_pct == 100)

        oc1, oc2, oc3 = st.columns(3)
        oc1.metric("Avg Compliance", f"{avg_compliance:.0f}%")
        oc2.metric("Trades Graded", len(all_grades))
        oc3.metric("Perfect (100%)", perfect)

        st.divider()

        # Per-setup breakdown
        st.markdown("**By Setup**")
        setup_grades = {}
        for g in all_grades:
            pid = g.playbook_id
            if pid not in setup_grades:
                setup_grades[pid] = []
            setup_grades[pid].append(g)

        for pid, grades in setup_grades.items():
            pb = pb_map.get(pid)
            name = pb.name if pb else f"Setup #{pid}"
            avg = sum(g.compliance_pct for g in grades) / len(grades)
            wins = 0
            losses = 0
            for g in grades:
                t = get_trade(g.trade_id, user_id=user_id)
                if t and t.pnl_pips > 0:
                    wins += 1
                elif t and t.pnl_pips < 0:
                    losses += 1

            with st.expander(f"**{name}** — {avg:.0f}% avg compliance ({len(grades)} trades)"):
                sc1, sc2, sc3, sc4 = st.columns(4)
                sc1.metric("Avg Compliance", f"{avg:.0f}%")
                sc2.metric("Trades", len(grades))
                sc3.metric("Wins", wins)
                sc4.metric("Losses", losses)

                # Most broken rules
                rule_breaks = {}
                for g in grades:
                    if g.rules_broken:
                        for r in g.rules_broken.split(","):
                            r = r.strip()
                            if r:
                                rule_breaks[r] = rule_breaks.get(r, 0) + 1

                if rule_breaks:
                    st.markdown("**Most Broken Rules:**")
                    for rule, count in sorted(rule_breaks.items(), key=lambda x: -x[1]):
                        st.markdown(f"- {rule} ({count}x)")
