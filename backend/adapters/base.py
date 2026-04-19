from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Memory:
    id: str
    content: str
    source: str  # adapter name
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class MemoryStats:
    total: int
    sources: dict[str, int]
    extra: dict[str, Any] = field(default_factory=dict)


class MemoryAdapter(ABC):
    name: str = "base"

    @abstractmethod
    async def list(self, user_id: str = "default", limit: int = 1000) -> list[Memory]:
        ...

    @abstractmethod
    async def get(self, memory_id: str) -> Memory:
        ...

    @abstractmethod
    async def search(self, query: str, user_id: str = "default", top_k: int = 10) -> list[Memory]:
        ...

    @abstractmethod
    async def create(self, content: str, user_id: str = "default", metadata: Optional[dict] = None) -> Memory:
        ...

    @abstractmethod
    async def update(self, memory_id: str, content: str, metadata: Optional[dict] = None) -> Memory:
        ...

    @abstractmethod
    async def delete(self, memory_id: str) -> None:
        ...

    @abstractmethod
    async def stats(self, user_id: str = "default") -> MemoryStats:
        ...

    def capabilities(self) -> set[str]:
        return {"list", "get", "search", "create", "update", "delete", "stats"}
