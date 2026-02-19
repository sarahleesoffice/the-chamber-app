import streamlit as st
from dotenv import load_dotenv
from lib.database import init_db

load_dotenv()

st.set_page_config(page_title="The Chamber", page_icon="\u269A", layout="wide")
init_db()

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

    /* Sidebar title — The Chamber branding above nav */
    section[data-testid="stSidebar"] > div:first-child {
        padding-top: 0;
    }
    section[data-testid="stSidebar"] > div:first-child::before {
        content: "THE CHAMBER";
        display: block;
        font-size: 1.6rem;
        font-weight: 700;
        color: #e8651a;
        letter-spacing: 3px;
        text-transform: uppercase;
        text-shadow: 0 0 20px rgba(232, 101, 26, 0.3);
        padding: 16px 16px 0 16px;
    }
    section[data-testid="stSidebar"] > div:first-child::after {
        content: "WHERE TRADING EVOLVES";
        display: block;
        font-size: 0.7rem;
        color: #9e4a15;
        letter-spacing: 2px;
        text-transform: uppercase;
        font-weight: 600;
        padding: 2px 16px 12px 16px;
        border-bottom: 1px solid #1e1a17;
        margin-bottom: 8px;
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
})
pg.run()
