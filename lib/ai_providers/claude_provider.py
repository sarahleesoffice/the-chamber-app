import base64
from anthropic import Anthropic
from lib.ai_providers.base import AIProvider
from lib.ai_providers.prompts import ICT_SYSTEM_PROMPT, build_analysis_prompt
from lib.models import Trade


CLAUDE_PRICING = {
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.00},
    "claude-opus-4-6": {"input": 15.00, "output": 75.00},
}
CLAUDE_DEFAULT_PRICING = {"input": 3.00, "output": 15.00}


class ClaudeProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6"):
        self.client = Anthropic(api_key=api_key)
        self.model = model

    def _calc_cost(self, input_tokens: int, output_tokens: int) -> float:
        pricing = CLAUDE_PRICING.get(self.model, CLAUDE_DEFAULT_PRICING)
        return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

    def analyze_trade(
        self,
        trade: Trade,
        chart_bytes: bytes | None,
        chart_mime_type: str | None,
        rag_context: str = "",
    ) -> str:
        content = []

        if chart_bytes and chart_mime_type:
            image_data = base64.b64encode(chart_bytes).decode("utf-8")
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": chart_mime_type,
                    "data": image_data,
                },
            })

        content.append({
            "type": "text",
            "text": build_analysis_prompt(trade, rag_context=rag_context),
        })

        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=ICT_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )
        return message.content[0].text

    def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        images: list[tuple[bytes, str]] | None = None,
    ) -> tuple[str, dict]:
        api_messages = []
        for i, m in enumerate(messages):
            # Attach images to the last user message
            if (images and i == len(messages) - 1 and m["role"] == "user"):
                content = []
                for img_bytes, img_mime in images:
                    content.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img_mime,
                            "data": base64.b64encode(img_bytes).decode("utf-8"),
                        },
                    })
                content.append({"type": "text", "text": m["content"]})
                api_messages.append({"role": "user", "content": content})
            else:
                api_messages.append({"role": m["role"], "content": m["content"]})

        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system_prompt,
            messages=api_messages,
        )
        inp = message.usage.input_tokens
        out = message.usage.output_tokens
        usage = {
            "input_tokens": inp,
            "output_tokens": out,
            "cost_usd": self._calc_cost(inp, out),
        }
        return message.content[0].text, usage

    def get_provider_name(self) -> str:
        return "Claude"

    def get_model_name(self) -> str:
        return self.model
