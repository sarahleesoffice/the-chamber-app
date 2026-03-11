from google import genai
from google.genai import types
from lib.ai_providers.base import AIProvider
from lib.ai_providers.prompts import ICT_SYSTEM_PROMPT, build_analysis_prompt
from lib.models import Trade


GEMINI_PRICING = {
    "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    "gemini-2.5-flash-preview-04-17": {"input": 0.15, "output": 0.60},
    "gemini-2.5-pro-preview-05-06": {"input": 1.25, "output": 10.00},
}
GEMINI_DEFAULT_PRICING = {"input": 0.10, "output": 0.40}


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def _calc_cost(self, input_tokens: int, output_tokens: int) -> float:
        pricing = GEMINI_PRICING.get(self.model, GEMINI_DEFAULT_PRICING)
        return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

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
    ) -> tuple[str, dict]:
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
        meta = response.usage_metadata
        inp = meta.prompt_token_count or 0
        out = meta.candidates_token_count or 0
        usage = {
            "input_tokens": inp,
            "output_tokens": out,
            "cost_usd": self._calc_cost(inp, out),
        }
        return response.text, usage

    def get_provider_name(self) -> str:
        return "Gemini"

    def get_model_name(self) -> str:
        return self.model
