import httpx
from typing import Optional
from .base import Memory, MemoryAdapter, MemoryStats


class Mem0Adapter(MemoryAdapter):
    name = "mem0"

    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.headers = {"x-api-key": api_key}

    def _to_memory(self, raw: dict) -> Memory:
        return Memory(
            id=raw.get("id", ""),
            content=raw.get("memory", raw.get("text", "")),
            source=self.name,
            metadata=raw.get("metadata", {}),
            created_at=raw.get("created_at"),
            updated_at=raw.get("updated_at"),
        )

    async def list(self, user_id: str = "default", limit: int = 1000) -> list[Memory]:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/memories",
                headers=self.headers,
                params={"user_id": user_id, "limit": limit},
                timeout=60,
            )
            r.raise_for_status()
            data = r.json()
            results = data.get("results", data) if isinstance(data, dict) else data
            return [self._to_memory(m) for m in results]

    async def get(self, memory_id: str) -> Memory:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/memories/{memory_id}",
                headers=self.headers,
                timeout=30,
            )
            r.raise_for_status()
            return self._to_memory(r.json())

    async def search(self, query: str, user_id: str = "default", top_k: int = 10) -> list[Memory]:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/memories/search",
                headers=self.headers,
                json={"query": query, "user_id": user_id, "limit": top_k},
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            results = data.get("results", data) if isinstance(data, dict) else data
            return [self._to_memory(m) for m in results]

    async def create(self, content: str, user_id: str = "default", metadata: Optional[dict] = None) -> Memory:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/memories",
                headers=self.headers,
                json={"content": content, "user_id": user_id, "metadata": metadata or {}},
                timeout=30,
            )
            r.raise_for_status()
            return self._to_memory(r.json())

    async def update(self, memory_id: str, content: str, metadata: Optional[dict] = None) -> Memory:
        async with httpx.AsyncClient() as client:
            r = await client.put(
                f"{self.base_url}/memories/{memory_id}",
                headers=self.headers,
                json={"content": content, "metadata": metadata or {}},
                timeout=30,
            )
            r.raise_for_status()
            return self._to_memory(r.json())

    async def delete(self, memory_id: str) -> None:
        async with httpx.AsyncClient() as client:
            r = await client.delete(
                f"{self.base_url}/memories/{memory_id}",
                headers=self.headers,
                timeout=30,
            )
            r.raise_for_status()

    async def stats(self, user_id: str = "default") -> MemoryStats:
        memories = await self.list(user_id=user_id, limit=10000)
        return MemoryStats(
            total=len(memories),
            sources={self.name: len(memories)},
        )
