"""
Live scrolling price ticker for The Chamber.
Fetches prices from Yahoo Finance and renders a fixed scrolling banner
at the very top of the page, above Streamlit's own header.
Works with Streamlit because <style> tags survive pg.run().
"""
import streamlit as st


@st.cache_data(ttl=60)
def _fetch_prices() -> list[dict]:
    """Fetch current prices for all tracked instruments."""
    import yfinance as yf

    symbols = {
        "NQ=F":    "NQ",
        "ES=F":    "ES",
        "YM=F":    "YM",
        "GC=F":    "GOLD",
        "SI=F":    "SILVER",
        "BTC-USD": "BTC",
        "ETH-USD": "ETH",
        "DX-Y.NYB": "DXY",
    }

    tickers_str = " ".join(symbols.keys())
    data = yf.Tickers(tickers_str)

    results = []
    for yf_sym, display_name in symbols.items():
        try:
            info = data.tickers[yf_sym].fast_info
            price = info.last_price
            prev = info.previous_close
            if price and prev and prev != 0:
                change_pct = ((price - prev) / prev) * 100
            else:
                change_pct = 0.0
            results.append({
                "name": display_name,
                "price": round(price or 0, 2),
                "change": round(change_pct, 2),
            })
        except Exception:
            results.append({"name": display_name, "price": 0, "change": 0})

    return results


def render_ticker_html(prices: list[dict]) -> str:
    """Return HTML for the ticker items with individual colors."""
    items = ""
    for p in prices:
        if p["price"] == 0:
            continue

        if p["name"] in ("BTC", "ETH", "GOLD", "SILVER"):
            price_str = f"${p['price']:,.2f}" if p["price"] >= 1000 else f"${p['price']:.2f}"
        elif p["name"] == "DXY":
            price_str = f"{p['price']:.2f}"
        else:
            price_str = f"{p['price']:,.2f}"

        if p["change"] > 0:
            color = "#ff7e33"
            arrow = "▲"
        elif p["change"] < 0:
            color = "#9e4a15"
            arrow = "▼"
        else:
            color = "#888"
            arrow = "–"

        change_str = f"{arrow}{abs(p['change']):.2f}%"

        items += (
            f'<span style="padding:0 18px;white-space:nowrap;">'
            f'<span style="color:#e8651a;font-weight:700;letter-spacing:1px;">{p["name"]}</span>'
            f'&nbsp;&nbsp;'
            f'<span style="color:#333;font-weight:600;">{price_str}</span>'
            f'&nbsp;&nbsp;'
            f'<span style="color:{color};font-weight:600;">{change_str}</span>'
            f'</span>'
        )

    return items


def render_ticker() -> None:
    """Render the scrolling price ticker at the very top of the page.

    Strategy:
    - CSS pushes Streamlit's own header, sidebar, and main content down 28px
    - Ticker div uses z-index higher than Streamlit's header (999990)
    - All styles are inline since Streamlit strips id/class attributes
    - Keyframes animation is injected via <style> tag (survives pg.run())
    """
    try:
        prices = _fetch_prices()
    except Exception:
        return

    if not prices or all(p["price"] == 0 for p in prices):
        return

    items_html = render_ticker_html(prices)
    # Double for seamless loop
    marquee = items_html + items_html

    # CSS: nuke Streamlit header, ticker sits flush at top
    ticker_css = """
    /* ── Live Price Ticker ── */
    @keyframes chamberTickerScroll {
        0%   { transform: translateX(0); }
        100% { transform: translateX(-50%); }
    }
    /* Completely hide Streamlit header — no gap */
    header[data-testid="stHeader"] {
        display: none !important;
    }
    /* Push sidebar down for ticker */
    section[data-testid="stSidebar"] {
        top: 28px !important;
    }
    /* Flush content right below ticker */
    section[data-testid="stMain"] {
        padding-top: 0 !important;
        margin-top: 0 !important;
    }
    section[data-testid="stMain"] .stMainBlockContainer {
        padding-top: 40px !important;
    }
    section[data-testid="stMain"] .stVerticalBlock {
        gap: 0.5rem !important;
    }
    """

    # Inject the CSS
    st.markdown(f"<style>{ticker_css}</style>", unsafe_allow_html=True)

    # Inject the ticker div — z-index 9999999 (above stHeader's 999990)
    st.markdown(
        f'<div style="position:fixed;top:0;left:0;right:0;z-index:9999999;'
        f'background:linear-gradient(180deg,#f5f5f5,#eeeeee);'
        f'border-bottom:1px solid #e0e0e0;padding:5px 0;overflow:hidden;height:28px;'
        f'font-family:-apple-system,BlinkMacSystemFont,SF Mono,Menlo,monospace;">'
        f'<div style="display:flex;white-space:nowrap;width:max-content;'
        f'animation:chamberTickerScroll 35s linear infinite;'
        f'font-size:0.72rem;letter-spacing:0.3px;color:#333;font-weight:500;">'
        f'{marquee}</div></div>',
        unsafe_allow_html=True,
    )
