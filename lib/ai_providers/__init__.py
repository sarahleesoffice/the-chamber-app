import streamlit as st
from lib.ai_providers.base import AIProvider
from lib.ai_providers.claude_provider import ClaudeProvider
from lib.ai_providers.gemini_provider import GeminiProvider
from lib.auth import get_current_user_id, get_api_key


def get_provider(provider_name: str, model: str) -> AIProvider:
    """Get an AI provider using the current user's API key."""
    user_id = get_current_user_id()

    if provider_name == "Claude":
        api_key = get_api_key(user_id, "anthropic") if user_id else None
        if not api_key:
            raise ValueError(
                "No Claude API key found. Go to **Settings** in the sidebar to add your Anthropic API key."
            )
        return ClaudeProvider(api_key=api_key, model=model)
    elif provider_name == "Gemini":
        api_key = get_api_key(user_id, "gemini") if user_id else None
        if not api_key:
            raise ValueError(
                "No Gemini API key found. Go to **Settings** in the sidebar to add your Google AI API key."
            )
        return GeminiProvider(api_key=api_key, model=model)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")
