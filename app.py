import streamlit as st
from dotenv import load_dotenv
from lib.database import init_db
from lib.auth import (
    init_users_table, init_api_keys_table, init_sessions_table,
    register_user, authenticate_user,
    is_logged_in, login_user, logout_user, get_current_username,
    create_session_token, delete_session_token,
    set_session_cookie, clear_session_cookie, try_cookie_login,
    SECURITY_QUESTIONS, get_security_question, verify_security_answer, reset_password,
)

load_dotenv()

st.set_page_config(page_title="The Chamber", page_icon="\u269A", layout="wide", initial_sidebar_state="expanded")
init_db()
init_users_table()
init_api_keys_table()
init_sessions_table()

# ── Try restoring session from cookie ────────────────────────
try_cookie_login()

# ── Navigation structure — define BEFORE auth gate so sidebar sections always show ──
pg = st.navigation({
    "TRADE": [
        st.Page("pages/0_Dashboard.py", title="Dashboard", icon=":material/dashboard:", default=True),
        st.Page("pages/1_Enter_Trade.py", title="Enter Trade", icon=":material/edit_note:"),
        st.Page("pages/2_Trade_History.py", title="Trade History", icon=":material/history:"),
        st.Page("pages/7_Pre_Trade.py", title="Pre-Trade Checklist", icon=":material/checklist:"),
        st.Page("pages/10_Import_Trades.py", title="Import Trades", icon=":material/upload_file:"),
    ],
    "REFLECT": [
        st.Page("pages/5_Daily_Journal.py", title="Daily Journal", icon=":material/menu_book:"),
        st.Page("pages/6_Performance.py", title="Performance", icon=":material/analytics:"),
        st.Page("pages/14_Trade_Replay.py", title="Trade Replay", icon=":material/replay:"),
        st.Page("pages/9_Playbook.py", title="Playbook", icon=":material/rule:"),
        st.Page("pages/3_AI_Analysis.py", title="AI Analysis", icon=":material/psychology:"),
        st.Page("pages/11_AI_ICT.py", title="AI ICT Chat", icon=":material/chat:"),
    ],
    "TOOLS": [
        st.Page("pages/18_Backtest.py", title="Backtest", icon=":material/candlestick_chart:"),
        st.Page("pages/19_Chart_Analyzer.py", title="Chart Analyzer", icon=":material/image_search:"),
    ],
    "MARKET STUDY": [
        st.Page("pages/13_Sessions.py", title="Sessions", icon=":material/schedule:"),
        st.Page("pages/8_Learning_Hub.py", title="Learning Hub", icon=":material/school:"),
        st.Page("pages/4_Knowledge_Base.py", title="Knowledge Base", icon=":material/library_books:"),
    ],
    "MARKET WATCH": [
        st.Page("pages/16_Economic_Calendar.py", title="Economic Calendar", icon=":material/event:"),
        st.Page("pages/15_Live_News.py", title="Live News", icon=":material/breaking_news:"),
        st.Page("pages/12_Watchlist.py", title="Watchlist", icon=":material/visibility:"),
    ],
    "ACCOUNT": [
        st.Page("pages/17_Settings.py", title="Settings", icon=":material/settings:"),
    ],
})

# ── Auth gate — must log in before seeing any pages ──────────
if not is_logged_in():
    # Minimal CSS for the login page
    st.markdown("""
    <style>
        .stApp { background-color: #0a0a0a; }
        section[data-testid="stSidebar"] { background-color: #0f0f0f; border-right: 1px solid #1a1210; }
        section[data-testid="stSidebar"] > div:first-child { padding-top:0; }
        section[data-testid="stSidebar"] > div:first-child::before { content:""; display:block; width:32px; height:32px; margin:4px auto 0; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='50' cy='50' r='46' fill='none' stroke='%23e8651a' stroke-width='2.5' opacity='0.6'/%3E%3Ccircle cx='50' cy='50' r='36' fill='none' stroke='%23e8651a' stroke-width='1.5' opacity='0.3'/%3E%3Cpath d='M50 18 C40 35,30 42,30 55 C30 66,39 75,50 75 C61 75,70 66,70 55 C70 42,60 35,50 18Z' fill='none' stroke='%23e8651a' stroke-width='2.5'/%3E%3Cpath d='M50 32 C44 42,38 47,38 55 C38 62,43 67,50 67 C57 67,62 62,62 55 C62 47,56 42,50 32Z' fill='%23e8651a' opacity='0.2'/%3E%3Ccircle cx='50' cy='54' r='5' fill='%23e8651a' opacity='0.7'/%3E%3C/svg%3E"); background-size:contain; background-repeat:no-repeat; }
        section[data-testid="stSidebar"] > div:first-child::after { content:"THE CHAMBER"; display:block; text-align:center; font-size:0.95rem; font-weight:700; color:#e8651a; letter-spacing:3px; text-shadow:0 0 20px rgba(232,101,26,0.3); padding:0 16px 4px; border-bottom:1px solid #1e1a17; margin-bottom:0; }
        section[data-testid="stSidebar"] [data-testid="stSidebarNav"] { padding-top:0 !important; margin-top:0 !important; }
        section[data-testid="stSidebar"] span[data-testid="stSidebarNavSeparatorLabel"] { color:#e8651a !important; font-size:0.7rem !important; letter-spacing:2px !important; font-weight:700 !important; }
        .stTextInput > div > div > input {
            background-color: #141414; border-color: #2a2a2a; color: #f5f5f5;
        }
        .stTextInput > div > div > input:focus {
            border-color: #e8651a; box-shadow: 0 0 0 1px #e8651a;
        }
        .stButton > button[kind="primary"] {
            background-color: #e8651a; color: #0a0a0a; border: none; font-weight: 600;
        }
        .stButton > button[kind="primary"]:hover {
            background-color: #ff7e33; box-shadow: 0 0 12px rgba(232,101,26,0.35);
        }
        .stTabs [aria-selected="true"] {
            color: #e8651a !important; border-bottom-color: #e8651a !important;
        }
    </style>
    """, unsafe_allow_html=True)

    st.markdown(
        '<div style="text-align:center; padding:40px 0 10px 0;">'
        '<div style="font-size:2.4rem; font-weight:700; color:#e8651a; letter-spacing:4px; '
        'text-shadow:0 0 30px rgba(232,101,26,0.4);">THE CHAMBER</div>'
        '<div style="color:#9e4a15; font-size:0.85rem; letter-spacing:2px; margin-top:4px;">'
        'WHERE TRADING EVOLVES</div></div>',
        unsafe_allow_html=True,
    )

    login_tab, register_tab, reset_tab = st.tabs(["Login", "Register", "Forgot Password"])

    with login_tab:
        with st.form("login_form"):
            email = st.text_input("Email")
            password = st.text_input("Password", type="password")
            submitted = st.form_submit_button("Enter The Chamber", type="primary", use_container_width=True)
            if submitted:
                if not email or not password:
                    st.error("Please fill in all fields.")
                else:
                    user = authenticate_user(email, password)
                    if user:
                        login_user(user)
                        token = create_session_token(user["id"])
                        set_session_cookie(token)
                        st.rerun()
                    else:
                        st.error("Invalid email or password.")

    with register_tab:
        with st.form("register_form"):
            reg_email = st.text_input("Email", key="reg_email")
            reg_username = st.text_input("Username", key="reg_username")
            reg_password = st.text_input("Password", type="password", key="reg_pw")
            reg_confirm = st.text_input("Confirm Password", type="password", key="reg_confirm")
            reg_question = st.selectbox("Security Question", SECURITY_QUESTIONS, key="reg_sq")
            reg_answer = st.text_input("Security Answer", key="reg_answer",
                                        help="Used to reset your password if you forget it")
            reg_submitted = st.form_submit_button("Create Account", type="primary", use_container_width=True)
            if reg_submitted:
                if not reg_email or not reg_username or not reg_password:
                    st.error("Please fill in all fields.")
                elif reg_password != reg_confirm:
                    st.error("Passwords don't match.")
                elif len(reg_password) < 6:
                    st.error("Password must be at least 6 characters.")
                elif not reg_answer.strip():
                    st.error("Please provide a security answer for password recovery.")
                else:
                    uid = register_user(reg_email, reg_username, reg_password,
                                         security_question=reg_question, security_answer=reg_answer)
                    if uid:
                        user = {"id": uid, "email": reg_email, "username": reg_username}
                        login_user(user)
                        token = create_session_token(uid)
                        set_session_cookie(token)
                        st.rerun()
                    else:
                        st.error("Email already registered.")

    with reset_tab:
        st.markdown('<p style="color:#9e4a15; font-size:0.85rem;">Enter your email to retrieve your security question.</p>',
                    unsafe_allow_html=True)
        reset_email = st.text_input("Email", key="reset_email")

        if reset_email:
            question = get_security_question(reset_email)
            if question:
                st.info(f"**Security Question:** {question}")
                with st.form("reset_form"):
                    reset_answer = st.text_input("Your Answer", key="reset_answer")
                    new_pw = st.text_input("New Password", type="password", key="new_pw")
                    new_pw_confirm = st.text_input("Confirm New Password", type="password", key="new_pw_confirm")
                    reset_submitted = st.form_submit_button("Reset Password", type="primary", use_container_width=True)
                    if reset_submitted:
                        if not reset_answer or not new_pw:
                            st.error("Please fill in all fields.")
                        elif new_pw != new_pw_confirm:
                            st.error("Passwords don't match.")
                        elif len(new_pw) < 6:
                            st.error("Password must be at least 6 characters.")
                        elif not verify_security_answer(reset_email, reset_answer):
                            st.error("Incorrect security answer.")
                        else:
                            reset_password(reset_email, new_pw)
                            st.success("Password reset! You can now log in with your new password.")
            else:
                st.warning("No account found with that email, or no security question set.")

    st.stop()  # Block everything below until logged in

# --- The Chamber Custom CSS ---
# Fire orange ember glow — like wax transforming inside the Puffco chamber
st.markdown("""
<style>
    /* Global — chamber walls */
    .stApp {
        background-color: #0a0a0a;
    }

    /* Sidebar */
    section[data-testid="stSidebar"] {
        background-color: #0f0f0f;
        border-right: 1px solid #1a1210;
    }

    /* Fire orange primary buttons */
    .stButton > button[kind="primary"] {
        background-color: #e8651a;
        color: #0a0a0a;
        border: none;
        font-weight: 600;
    }
    .stButton > button[kind="primary"]:hover {
        background-color: #ff7e33;
        color: #0a0a0a;
        box-shadow: 0 0 12px rgba(232, 101, 26, 0.35);
    }

    /* Secondary buttons */
    .stButton > button[kind="secondary"],
    .stButton > button {
        border: 1px solid #2a2a2a;
        color: #f5f5f5;
    }
    .stButton > button[kind="secondary"]:hover,
    .stButton > button:hover {
        border-color: #e8651a;
        color: #e8651a;
    }

    /* Headers */
    h1, h2, h3 {
        color: #f5f5f5 !important;
    }

    /* Dividers */
    hr {
        border-color: #1e1a17;
    }

    /* Metric positive/negative */
    [data-testid="stMetricDelta"] svg {
        display: none;
    }

    /* Cards and expanders */
    .streamlit-expanderHeader {
        background-color: #141414;
        border: 1px solid #1e1a17;
    }

    /* Inputs */
    .stTextInput > div > div > input,
    .stTextArea > div > div > textarea,
    .stNumberInput > div > div > input,
    .stSelectbox > div > div {
        background-color: #141414;
        border-color: #2a2a2a;
        color: #f5f5f5;
    }

    /* Focus state — ember glow */
    .stTextInput > div > div > input:focus,
    .stTextArea > div > div > textarea:focus,
    .stNumberInput > div > div > input:focus {
        border-color: #e8651a;
        box-shadow: 0 0 0 1px #e8651a, 0 0 8px rgba(232, 101, 26, 0.2);
    }

    /* Radio buttons */
    .stRadio > div {
        color: #f5f5f5;
    }

    /* Tabs */
    .stTabs [data-baseweb="tab"] {
        color: #a0a0a0;
    }
    .stTabs [aria-selected="true"] {
        color: #e8651a !important;
        border-bottom-color: #e8651a !important;
    }

    /* Sidebar — tight spacing, logo above nav via CSS */
    section[data-testid="stSidebar"] > div:first-child {
        padding-top: 0;
    }
    section[data-testid="stSidebar"] [data-testid="stSidebarNav"] {
        padding-top: 0 !important;
        margin-top: 0 !important;
    }
    /* Chamber logo — SVG flame + text via ::before/::after */
    section[data-testid="stSidebar"] > div:first-child::before {
        content: "";
        display: block;
        width: 32px;
        height: 32px;
        margin: 4px auto 0 auto;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='50' cy='50' r='46' fill='none' stroke='%23e8651a' stroke-width='2.5' opacity='0.6'/%3E%3Ccircle cx='50' cy='50' r='36' fill='none' stroke='%23e8651a' stroke-width='1.5' opacity='0.3'/%3E%3Cpath d='M50 18 C40 35,30 42,30 55 C30 66,39 75,50 75 C61 75,70 66,70 55 C70 42,60 35,50 18Z' fill='none' stroke='%23e8651a' stroke-width='2.5'/%3E%3Cpath d='M50 32 C44 42,38 47,38 55 C38 62,43 67,50 67 C57 67,62 62,62 55 C62 47,56 42,50 32Z' fill='%23e8651a' opacity='0.2'/%3E%3Ccircle cx='50' cy='54' r='5' fill='%23e8651a' opacity='0.7'/%3E%3C/svg%3E");
        background-size: contain;
        background-repeat: no-repeat;
    }
    section[data-testid="stSidebar"] > div:first-child::after {
        content: "THE CHAMBER";
        display: block;
        text-align: center;
        font-size: 0.95rem;
        font-weight: 700;
        color: #e8651a;
        letter-spacing: 3px;
        text-transform: uppercase;
        text-shadow: 0 0 20px rgba(232, 101, 26, 0.3);
        padding: 0 16px 4px 16px;
        border-bottom: 1px solid #1e1a17;
        margin-bottom: 0;
    }
    /* Sidebar section headers — TRADE, REFLECT, etc. */
    section[data-testid="stSidebar"] h2,
    section[data-testid="stSidebar"] [data-testid="stSidebarNavSeparator"],
    section[data-testid="stSidebar"] span[data-testid="stSidebarNavSeparatorLabel"] {
        color: #e8651a !important;
        font-size: 0.7rem !important;
        letter-spacing: 2px !important;
        text-transform: uppercase !important;
        font-weight: 700 !important;
        padding-top: 10px !important;
        margin-bottom: 0 !important;
    }

    /* Active sidebar nav link — fire orange */
    section[data-testid="stSidebar"] a[aria-current="page"] span,
    section[data-testid="stSidebar"] a[aria-current="page"] p,
    section[data-testid="stSidebar"] [data-testid="stSidebarNavLink"][aria-current="page"] span,
    section[data-testid="stSidebar"] [data-testid="stSidebarNavLink"][aria-current="page"] p {
        color: #e8651a !important;
        font-weight: 600;
    }
    section[data-testid="stSidebar"] a[aria-current="page"] .icon,
    section[data-testid="stSidebar"] a[aria-current="page"] svg,
    section[data-testid="stSidebar"] [data-testid="stSidebarNavLink"][aria-current="page"] svg {
        color: #e8651a !important;
        fill: #e8651a !important;
    }
    /* Sidebar nav items — active background */
    section[data-testid="stSidebar"] a[aria-current="page"],
    section[data-testid="stSidebar"] [data-testid="stSidebarNavLink"][aria-current="page"] {
        background-color: rgba(232, 101, 26, 0.1) !important;
        border-left: 3px solid #e8651a !important;
    }
    /* Sidebar nav hover */
    section[data-testid="stSidebar"] a:hover span,
    section[data-testid="stSidebar"] a:hover p,
    section[data-testid="stSidebar"] [data-testid="stSidebarNavLink"]:hover span,
    section[data-testid="stSidebar"] [data-testid="stSidebarNavLink"]:hover p {
        color: #e8651a !important;
    }

    /* File uploader */
    [data-testid="stFileUploader"] {
        border-color: #2a2a2a;
    }

    /* Success messages — keep green */
    .stSuccess {
        background-color: rgba(34, 197, 94, 0.1);
        border-left-color: #22c55e;
    }
    .stError {
        background-color: rgba(239, 68, 68, 0.1);
        border-left-color: #ef4444;
    }

    /* ALL alert/notification boxes — Chamber fire orange theme */
    /* Info blocks */
    [data-testid="stNotification"],
    .stAlert,
    div[data-baseweb="notification"] {
        background-color: rgba(232, 101, 26, 0.1) !important;
        border-left-color: #e8651a !important;
        color: #f5f5f5 !important;
    }
    [data-testid="stNotification"] p,
    [data-testid="stNotification"] span,
    .stAlert p,
    .stAlert span,
    div[data-baseweb="notification"] p,
    div[data-baseweb="notification"] span {
        color: #f5f5f5 !important;
    }
    [data-testid="stNotification"] svg,
    .stAlert svg,
    div[data-baseweb="notification"] svg {
        fill: #e8651a !important;
    }

    /* st.info — override blue */
    div[data-testid="stAlert"]:has([data-testid="stAlertContentInfo"]) {
        background-color: rgba(232, 101, 26, 0.1) !important;
        border-left-color: #e8651a !important;
    }
    div[data-testid="stAlert"]:has([data-testid="stAlertContentInfo"]) svg {
        fill: #e8651a !important;
    }
    div[data-testid="stAlert"]:has([data-testid="stAlertContentInfo"]) p,
    div[data-testid="stAlert"]:has([data-testid="stAlertContentInfo"]) span {
        color: #f5f5f5 !important;
    }

    /* st.warning — override yellow/olive */
    div[data-testid="stAlert"]:has([data-testid="stAlertContentWarning"]) {
        background-color: rgba(232, 101, 26, 0.1) !important;
        border-left-color: #e8651a !important;
    }
    div[data-testid="stAlert"]:has([data-testid="stAlertContentWarning"]) svg {
        fill: #e8651a !important;
    }
    div[data-testid="stAlert"]:has([data-testid="stAlertContentWarning"]) p,
    div[data-testid="stAlert"]:has([data-testid="stAlertContentWarning"]) span {
        color: #f5f5f5 !important;
    }

    /* Catch-all for any remaining blue/yellow alert boxes via role */
    [role="alert"] {
        background-color: rgba(232, 101, 26, 0.1) !important;
        border-left-color: #e8651a !important;
        color: #f5f5f5 !important;
    }
    [role="alert"] p,
    [role="alert"] span {
        color: #f5f5f5 !important;
    }
    [role="alert"] svg {
        fill: #e8651a !important;
    }

    /* =============================================== */
    /* MOBILE RESPONSIVE — max 768px                  */
    /* =============================================== */
    @media (max-width: 768px) {
        /* Reduce main padding */
        .main .block-container {
            padding-left: 0.5rem !important;
            padding-right: 0.5rem !important;
            padding-top: 1rem !important;
        }

        /* Sidebar branding — smaller on mobile */
        section[data-testid="stSidebar"] > div:first-child::before {
            font-size: 1.2rem;
            letter-spacing: 2px;
            padding: 10px 10px 0 10px;
        }
        section[data-testid="stSidebar"] > div:first-child::after {
            font-size: 0.65rem;
            padding: 2px 10px 8px 10px;
        }

        /* Headers smaller on mobile */
        h1 { font-size: 1.4rem !important; }
        h2 { font-size: 1.2rem !important; }
        h3 { font-size: 1rem !important; }

        /* Stat card grids: 2 columns on mobile */
        div[style*="grid-template-columns:repeat(4,1fr)"],
        div[style*="grid-template-columns:repeat(5,1fr)"],
        div[style*="grid-template-columns:repeat(6,1fr)"] {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 4px !important;
        }

        /* Stat cards — compact padding on mobile */
        div[style*="grid-template-columns:repeat(2, 1fr)"] > div {
            padding: 10px 6px !important;
        }

        /* Trading calendar: 7-col grid → smaller cells */
        div[style*="grid-template-columns:repeat(7,1fr)"] > div {
            min-height: 60px !important;
            padding: 4px 2px !important;
            font-size: 0.7rem !important;
        }

        /* Economic calendar: 5-col grid — stack to 1 col on small screens */
        div[style*="grid-template-columns:repeat(5,1fr)"] {
            grid-template-columns: 1fr !important;
            gap: 6px !important;
        }

        /* Columns stack on mobile */
        [data-testid="stHorizontalBlock"] {
            flex-wrap: wrap !important;
        }
        [data-testid="stHorizontalBlock"] > [data-testid="stColumn"] {
            flex: 1 1 100% !important;
            min-width: 100% !important;
        }

        /* SVG donut — smaller */
        svg[viewBox="0 0 120 120"] {
            width: 140px !important;
            height: 140px !important;
        }

        /* Legend — wrap on mobile */
        div[style*="justify-content:center"][style*="gap:20px"],
        div[style*="justify-content:center"][style*="gap:16px"] {
            gap: 8px !important;
        }

        /* Tabs — scrollable on mobile */
        .stTabs [data-baseweb="tab-list"] {
            overflow-x: auto !important;
        }
        .stTabs [data-baseweb="tab"] {
            font-size: 0.8rem !important;
            padding: 6px 10px !important;
        }

        /* Buttons — smaller on mobile */
        .stButton > button {
            padding: 4px 10px !important;
            font-size: 0.8rem !important;
        }

        /* Segmented control — compact */
        [data-testid="stSegmentedControl"] button {
            padding: 4px 8px !important;
            font-size: 0.75rem !important;
        }
    }

    /* =============================================== */
    /* TABLET — 769px to 1024px                       */
    /* =============================================== */
    @media (min-width: 769px) and (max-width: 1024px) {
        /* Stat card grids: 3 columns on tablet */
        div[style*="grid-template-columns:repeat(5,1fr)"],
        div[style*="grid-template-columns:repeat(6,1fr)"] {
            grid-template-columns: repeat(3, 1fr) !important;
        }

        /* Trading calendar cells — medium size */
        div[style*="grid-template-columns:repeat(7,1fr)"] > div {
            min-height: 70px !important;
        }
    }
</style>
""", unsafe_allow_html=True)

with st.sidebar:
    # ── User info + Logout ──
    st.markdown(
        f'<div style="color:#888; font-size:0.8rem; padding:0 0 4px 0;">Logged in as '
        f'<span style="color:#e8651a; font-weight:600;">{get_current_username()}</span></div>',
        unsafe_allow_html=True,
    )
    if st.button("Logout", key="logout_btn"):
        from lib.auth import get_current_user_id as _get_uid
        delete_session_token(_get_uid())
        clear_session_cookie()
        logout_user()
        st.rerun()
    st.divider()

    provider = st.radio("AI Provider", ["Claude", "Gemini"], key="ai_provider")

    if provider == "Claude":
        model = st.selectbox(
            "Model",
            ["claude-sonnet-4-5-20250514", "claude-opus-4-5-20250101"],
            format_func=lambda x: x.split("-20")[0].replace("claude-", "Claude ").title(),
            key="ai_model",
        )
    else:
        model = st.selectbox(
            "Model",
            ["gemini-2.0-flash", "gemini-2.5-pro-preview-05-06"],
            format_func=lambda x: x.replace("-preview-05-06", "").replace("-", " ").title(),
            key="ai_model",
        )

    st.divider()
    st.markdown(
        '<a href="https://discord.gg/wRwCBuyW" target="_blank" style="'
        'display:flex; align-items:center; gap:8px; padding:8px 12px; '
        'background:rgba(88,101,242,0.1); border:1px solid rgba(88,101,242,0.3); '
        'border-radius:6px; text-decoration:none; color:#7289da; font-size:0.85rem; '
        'font-weight:600; transition:all 0.2s;">'
        '<svg width="18" height="14" viewBox="0 0 71 55" fill="#7289da">'
        '<path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37 37 0 0025.4.3a.2.2 0 00-.2-.1A58.4 58.4 0 0010.5 4.9a.2.2 0 00-.1.1C1.5 18.7-.9 32.2.3 45.5v.2a58.9 58.9 0 0017.7 9a.2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.6 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .4 36.4 36.4 0 01-5.5 2.6.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.3.1A58.7 58.7 0 0070.4 45.7v-.2c1.4-15-2.3-28-9.8-39.5a.2.2 0 00-.1-.1zM23.7 37.3c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.8 7-6.2 7zm23 0c-3.4 0-6.2-3.1-6.2-7s2.7-7 6.2-7 6.3 3.2 6.2 7-2.7 7-6.2 7z"/>'
        '</svg>'
        'Join Discord'
        '</a>',
        unsafe_allow_html=True,
    )

pg.run()
