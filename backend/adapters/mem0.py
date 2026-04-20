from __future__ import annotations

import asyncio
import time
import httpx
from typing import Optional
from .base import Memory, MemoryAdapter, MemoryStats


class Mem0Adapter(MemoryAdapter):
    name = "mem0"

    _CACHE_TTL = 60  # seconds

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {"x-api-key": api_key}
        self._client: httpx.AsyncClient | None = None
        # cache: (user_id, limit) -> (ts, memories)
        self._list_cache: dict[tuple[str, int], tuple[float, list[Memory]]] = {}
        self._list_lock: asyncio.Lock | None = None

    def _get_lock(self) -> asyncio.Lock:
        if self._list_lock is None:
            self._list_lock = asyncio.Lock()
        return self._list_lock

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers=self.headers,
                timeout=60,
                limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            )
        return self._client

    def _to_memory(self, raw: dict) -> Memory:
        return Memory(
            id=raw.get("id", ""),
            content=raw.get("memory", raw.get("text", "")),
            source=self.name,
            metadata=raw.get("metadata", {}),
            created_at=raw.get("created_at"),
            updated_at=raw.get("updated_at"),
        )

    def _invalidate(self) -> None:
        self._list_cache.clear()

    async def list(self, user_id: str = "default", limit: int = 1000) -> list[Memory]:
        key = (user_id, limit)
        now = time.monotonic()
        cached = self._list_cache.get(key)
        if cached and now - cached[0] < self._CACHE_TTL:
            return cached[1]

        async with self._get_lock():
            # re-check after acquiring lock
            cached = self._list_cache.get(key)
            now = time.monotonic()
            if cached and now - cached[0] < self._CACHE_TTL:
                return cached[1]

            client = self._get_client()
            r = await client.get(
                f"{self.base_url}/memories",
                params={"user_id": user_id, "limit": limit},
            )
            r.raise_for_status()
            data = r.json()
            results = data.get("results", data) if isinstance(data, dict) else data
            memories = [self._to_memory(m) for m in results]
            self._list_cache[key] = (time.monotonic(), memories)
            return memories

    async def get(self, memory_id: str) -> Memory:
        client = self._get_client()
        r = await client.get(f"{self.base_url}/memories/{memory_id}", timeout=30)
        r.raise_for_status()
        return self._to_memory(r.json())

    async def search(self, query: str, user_id: str = "default", top_k: int = 10) -> list[Memory]:
        client = self._get_client()
        r = await client.post(
            f"{self.base_url}/memories/search",
            json={"query": query, "user_id": user_id, "limit": top_k},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        results = data.get("results", data) if isinstance(data, dict) else data
        return [self._to_memory(m) for m in results]

    async def create(self, content: str, user_id: str = "default", metadata: Optional[dict] = None) -> Memory:
        client = self._get_client()
        r = await client.post(
            f"{self.base_url}/memories",
            json={"content": content, "user_id": user_id, "metadata": metadata or {}},
            timeout=30,
        )
        r.raise_for_status()
        self._invalidate()
        return self._to_memory(r.json())

    async def update(self, memory_id: str, content: str, metadata: Optional[dict] = None) -> Memory:
        client = self._get_client()
        r = await client.put(
            f"{self.base_url}/memories/{memory_id}",
            json={"content": content, "metadata": metadata or {}},
            timeout=30,
        )
        r.raise_for_status()
        self._invalidate()
        return self._to_memory(r.json())

    async def delete(self, memory_id: str) -> None:
        client = self._get_client()
        r = await client.delete(f"{self.base_url}/memories/{memory_id}", timeout=30)
        r.raise_for_status()
        self._invalidate()

    async def stats(self, user_id: str = "default") -> MemoryStats:
        # reuse cached list if available; otherwise list() will populate
        memories = await self.list(user_id=user_id, limit=10000)
        return MemoryStats(
            total=len(memories),
            sources={self.name: len(memories)},
        )
