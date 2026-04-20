from __future__ import annotations

import json

import httpx

from .base import LLMAdapter
from .prompts import EXTRACT_SYSTEM, TAG_SYSTEM, SUMMARIZE_SYSTEM, parse_json


class OpenAICompatibleAdapter(LLMAdapter):
    """Covers OpenAI, OpenRouter, Groq, Together, LM Studio — any /v1/chat/completions endpoint."""

    name = "openai_compatible"

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def _headers(self) -> dict:
        h: dict = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.base_url}/v1/models", headers=self._headers())
                return r.status_code == 200
        except Exception:
            return False

    async def _chat(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{self.base_url}/v1/chat/completions",
                headers=self._headers(),
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                })
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

    async def extract(self, text: str, schema: dict) -> list[dict]:
        user = f"Schema:\n{json.dumps(schema, indent=2)}\n\nText:\n{text}"
        raw = await self._chat(EXTRACT_SYSTEM, user)
        return parse_json(raw)

    async def tag(self, content: str, taxonomy: list[str] | None = None) -> list[str]:
        user = f"Taxonomy: {taxonomy}\n\n{content}" if taxonomy else content
        raw = await self._chat(TAG_SYSTEM, user)
        return parse_json(raw)

    async def summarize(self, texts: list[str], style: str = "bullet") -> str:
        return await self._chat(SUMMARIZE_SYSTEM, "\n\n---\n\n".join(texts))
