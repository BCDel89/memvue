from __future__ import annotations

from abc import ABC, abstractmethod


class LLMAdapter(ABC):
    name: str = "base"

    @abstractmethod
    async def health(self) -> bool: ...

    @abstractmethod
    async def extract(self, text: str, schema: dict) -> list[dict]: ...

    @abstractmethod
    async def tag(self, content: str, taxonomy: list[str] | None = None) -> list[str]: ...

    @abstractmethod
    async def summarize(self, texts: list[str], style: str = "bullet") -> str: ...

    def capabilities(self) -> set[str]:
        return {"extract", "tag", "summarize"}
