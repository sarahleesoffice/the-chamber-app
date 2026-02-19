import os
from dotenv import load_dotenv
from lib.ai_providers.base import AIProvider
from lib.ai_providers.claude_provider import ClaudeProvider
from lib.ai_providers.gemini_provider import GeminiProvider

load_dotenv()


def get_provider(provider_name: str, model: str) -> AIProvider:
    if provider_name == "Claude":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set in .env file")
        return ClaudeProvider(api_key=api_key, model=model)
    elif provider_name == "Gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set in .env file")
        return GeminiProvider(api_key=api_key, model=model)
    else:
        raise ValueError(f"Unknown provider: {provider_name}")
