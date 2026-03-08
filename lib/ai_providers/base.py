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
    ) -> str:
        """Send a multi-turn chat. Optionally attach images (bytes, mime_type) to the latest user message."""
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        pass
