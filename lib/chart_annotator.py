from __future__ import annotations

import base64
import json
import os
import re
from typing import Any

from anthropic import Anthropic
from google import genai
from google.genai import types

ANNOTATION_PROMPT = """
You are an ICT chart parser. Analyze this TradingView screenshot and detect ICT concepts.
Return STRICT JSON only (no markdown fences, no extra text) using this schema:
{
  "market_bias": "bullish|bearish|neutral|unknown",
  "timeframe_guess": "string",
  "concepts": {
    "order_blocks": [
      {"type":"bullish|bearish","confidence":0-1,"description":"short text","zone":{"top":number|null,"bottom":number|null}}
    ],
    "fvg": [
      {"type":"bullish|bearish","confidence":0-1,"description":"short text","zone":{"top":number|null,"bottom":number|null}}
    ],
    "bos_mss": [
      {"type":"BOS|MSS","direction":"bullish|bearish","confidence":0-1,"description":"short text"}
    ],
    "liquidity_levels": [
      {"type":"buy_side|sell_side|equal_highs|equal_lows|session_high|session_low","confidence":0-1,"description":"short text","level":number|null}
    ]
  },
  "key_levels": [number],
  "summary": "2-4 sentence concise summary",
  "trade_idea": {
    "direction": "long|short|none",
    "entry_zone": {"top": number|null, "bottom": number|null},
    "invalid_if": "string",
    "targets": [number]
  }
}
If uncertain, still return valid JSON and use lower confidence scores.
""".strip()


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass

    # Try fenced JSON
    m = re.search(r"```json\s*(\{.*\})\s*```", text, re.S)
    if m:
        return json.loads(m.group(1))

    # Try first object region
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start:end + 1])

    raise ValueError("Model did not return parseable JSON")


def analyze_chart_with_ai(
    image_bytes: bytes,
    mime_type: str,
    provider_name: str,
    model: str,
) -> dict[str, Any]:
    provider_name = provider_name.strip().lower()

    if provider_name == "claude":
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")
        client = Anthropic(api_key=api_key)
        b64 = base64.b64encode(image_bytes).decode("utf-8")

        resp = client.messages.create(
            model=model,
            max_tokens=2400,
            system="You are a precise JSON-only ICT chart parser.",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": mime_type,
                                "data": b64,
                            },
                        },
                        {"type": "text", "text": ANNOTATION_PROMPT},
                    ],
                }
            ],
        )
        text = resp.content[0].text
        return _extract_json(text)

    if provider_name == "gemini":
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set")
        client = genai.Client(api_key=api_key)

        resp = client.models.generate_content(
            model=model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                ANNOTATION_PROMPT,
            ],
            config=types.GenerateContentConfig(
                system_instruction="Return strict JSON only.",
                max_output_tokens=2400,
                temperature=0.2,
            ),
        )
        return _extract_json(resp.text or "")

    raise ValueError(f"Unsupported provider: {provider_name}")
