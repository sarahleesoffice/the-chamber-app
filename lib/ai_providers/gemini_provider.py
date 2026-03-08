from google import genai
from google.genai import types
from lib.ai_providers.base import AIProvider
from lib.ai_providers.prompts import ICT_SYSTEM_PROMPT, build_analysis_prompt
from lib.models import Trade


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def analyze_trade(
        self,
        trade: Trade,
        chart_bytes: bytes | None,
        chart_mime_type: str | None,
        rag_context: str = "",
    ) -> str:
        contents = []

        if chart_bytes and chart_mime_type:
            contents.append(
                types.Part.from_bytes(data=chart_bytes, mime_type=chart_mime_type)
            )

        contents.append(build_analysis_prompt(trade, rag_context=rag_context))

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=ICT_SYSTEM_PROMPT,
                max_output_tokens=4096,
            ),
        )
        return response.text

    def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        images: list[tuple[bytes, str]] | None = None,
    ) -> str:
        # Convert to Gemini's content format
        contents = []
        for i, m in enumerate(messages):
            role = "user" if m["role"] == "user" else "model"
            parts = []
            # Attach images to the last user message
            if (images and i == len(messages) - 1 and m["role"] == "user"):
                for img_bytes, img_mime in images:
                    parts.append(types.Part.from_bytes(data=img_bytes, mime_type=img_mime))
            parts.append(types.Part.from_text(text=m["content"]))
            contents.append(types.Content(role=role, parts=parts))

        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=4096,
            ),
        )
        return response.text

    def get_provider_name(self) -> str:
        return "Gemini"

    def get_model_name(self) -> str:
        return self.model
