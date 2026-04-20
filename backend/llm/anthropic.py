from __future__ import annotations

import json

import httpx

from .base import LLMAdapter
from .prompts import EXTRACT_SYSTEM, TAG_SYSTEM, SUMMARIZE_SYSTEM, parse_json

_API = "https://api.anthropic.com"
_VERSION = "2023-06-01"


class AnthropicAdapter(LLMAdapter):
    name = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": _VERSION,
            "Content-Type": "application/json",
        }

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(f"{_API}/v1/messages",
                    headers=self._headers(),
                    json={
                        "model": self.model,
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "ping"}],
                    })
                # 200 = success, 400 = bad request but reachable, 401/403 = bad key
                return r.status_code in (200, 400)
        except Exception:
            return False

    async def _chat(self, system: str, user: str) -> str:
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(f"{_API}/v1/messages",
                headers=self._headers(),
                json={
                    "model": self.model,
                    "system": system,
                    "max_tokens": 4096,
                    "messages": [{"role": "user", "content": user}],
                })
            r.raise_for_status()
            return r.json()["content"][0]["text"]

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
