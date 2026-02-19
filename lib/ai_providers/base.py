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
    ) -> str:
        """Send a multi-turn chat. messages = [{"role": "user"|"assistant", "content": str}, ...]"""
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        pass
