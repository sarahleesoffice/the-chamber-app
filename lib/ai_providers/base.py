from abc import ABC, abstractmethod
from lib.models import Trade


class AIProvider(ABC):
    @abstractmethod
    def analyze_trade(
        self,
        trade: Trade,
        chart_bytes: bytes | None,
        chart_mime_type: str | None,
        rag_context: str = "",
    ) -> str:
        pass

    @abstractmethod
    def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        images: list[tuple[bytes, str]] | None = None,
    ) -> tuple[str, dict]:
        """Send a multi-turn chat. Returns (response_text, usage_dict).
        usage_dict has keys: input_tokens, output_tokens, cost_usd."""
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        pass
