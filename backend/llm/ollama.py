from __future__ import annotations

import json

import httpx

from .base import LLMAdapter
from .prompts import EXTRACT_SYSTEM, TAG_SYSTEM, SUMMARIZE_SYSTEM, parse_json


class OllamaAdapter(LLMAdapter):
    name = "ollama"

    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                return r.status_code == 200
        except Exception:
            return False

    async def _chat(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{self.base_url}/api/chat", json={
                "model": self.model,
                "stream": False,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            })
            r.raise_for_status()
            return r.json()["message"]["content"]

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
