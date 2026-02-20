import streamlit as st

from lib.auth import (
    get_current_user_id,
    get_current_username,
    get_api_key,
    save_api_key,
    delete_api_key,
)

st.header("Settings")
st.caption("Manage your API keys and account settings.")

user_id = get_current_user_id()

# ============================================================
# API KEYS
# ============================================================
st.subheader("AI API Keys")
st.markdown(
    "To use **AI Analysis** and **AI ICT Chat**, you need your own API key. "
    "Your key is stored securely and only used for your requests."
)

st.divider()

# --- Anthropic (Claude) ---
st.markdown("**Claude (Anthropic)**")
st.caption("Get your key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)")

existing_claude = get_api_key(user_id, "anthropic")
claude_status = "✅ Key saved" if existing_claude else "❌ No key"
st.markdown(f"Status: {claude_status}")

with st.form("claude_key_form"):
    claude_key = st.text_input(
        "Anthropic API Key",
        type="password",
        placeholder="sk-ant-...",
        value="",
        help="Starts with sk-ant-",
    )
    col1, col2 = st.columns(2)
    with col1:
        save_claude = st.form_submit_button("Save Claude Key", type="primary", use_container_width=True)
    with col2:
        remove_claude = st.form_submit_button("Remove Key", use_container_width=True)

    if save_claude:
        if claude_key and claude_key.strip():
            save_api_key(user_id, "anthropic", claude_key.strip())
            st.success("Claude API key saved!")
            st.rerun()
        else:
            st.warning("Please enter a valid API key.")
    if remove_claude:
        delete_api_key(user_id, "anthropic")
        st.success("Claude API key removed.")
        st.rerun()

st.divider()

# --- Google (Gemini) ---
st.markdown("**Gemini (Google AI)**")
st.caption("Get your key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)")

existing_gemini = get_api_key(user_id, "gemini")
gemini_status = "✅ Key saved" if existing_gemini else "❌ No key"
st.markdown(f"Status: {gemini_status}")

with st.form("gemini_key_form"):
    gemini_key = st.text_input(
        "Google AI API Key",
        type="password",
        placeholder="AIza...",
        value="",
        help="Starts with AIza",
    )
    col3, col4 = st.columns(2)
    with col3:
        save_gemini = st.form_submit_button("Save Gemini Key", type="primary", use_container_width=True)
    with col4:
        remove_gemini = st.form_submit_button("Remove Key", use_container_width=True)

    if save_gemini:
        if gemini_key and gemini_key.strip():
            save_api_key(user_id, "gemini", gemini_key.strip())
            st.success("Gemini API key saved!")
            st.rerun()
        else:
            st.warning("Please enter a valid API key.")
    if remove_gemini:
        delete_api_key(user_id, "gemini")
        st.success("Gemini API key removed.")
        st.rerun()

st.divider()

# ============================================================
# ACCOUNT INFO
# ============================================================
st.subheader("Account")
st.markdown(f"**Username:** {get_current_username()}")
st.markdown(f"**User ID:** {user_id}")
