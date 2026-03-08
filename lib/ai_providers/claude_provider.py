import base64
from anthropic import Anthropic
from lib.ai_providers.base import AIProvider
from lib.ai_providers.prompts import ICT_SYSTEM_PROMPT, build_analysis_prompt
from lib.models import Trade


class ClaudeProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6"):
        self.client = Anthropic(api_key=api_key)
        self.model = model

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
    ) -> str:
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
        return message.content[0].text

    def get_provider_name(self) -> str:
        return "Claude"

    def get_model_name(self) -> str:
        return self.model
