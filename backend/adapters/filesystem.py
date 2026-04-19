import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from .base import Memory, MemoryAdapter, MemoryStats

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    body = text[m.end():]
    return meta, body


def _mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime).isoformat()


class FilesystemAdapter(MemoryAdapter):
    name = "filesystem"

    def __init__(self, root: str, extensions: list[str] | None = None):
        self.root = Path(root).expanduser().resolve()
        self.extensions = set(extensions or [".md", ".txt"])

    def _scan(self) -> list[Path]:
        results = []
        for path in self.root.rglob("*"):
            if path.is_file() and path.suffix in self.extensions:
                results.append(path)
        return results

    def _path_to_id(self, path: Path) -> str:
        return str(path.relative_to(self.root))

    def _id_to_path(self, memory_id: str) -> Path:
        return self.root / memory_id

    def _read(self, path: Path) -> Memory:
        text = path.read_text(encoding="utf-8")
        meta, body = _parse_frontmatter(text)
        rel = self._path_to_id(path)
        return Memory(
            id=rel,
            content=body.strip(),
            source=self.name,
            metadata={**meta, "path": str(path), "filename": path.name},
            created_at=_mtime(path),
            updated_at=_mtime(path),
        )

    async def list(self, user_id: str = "default", limit: int = 1000) -> list[Memory]:
        paths = sorted(self._scan(), key=lambda p: p.stat().st_mtime, reverse=True)
        return [self._read(p) for p in paths[:limit]]

    async def get(self, memory_id: str) -> Memory:
        path = self._id_to_path(memory_id)
        if not path.exists():
            raise FileNotFoundError(f"No file at {path}")
        return self._read(path)

    async def search(self, query: str, user_id: str = "default", top_k: int = 10) -> list[Memory]:
        q = query.lower()
        results = []
        for path in self._scan():
            try:
                m = self._read(path)
                if q in m.content.lower() or q in m.id.lower():
                    results.append(m)
            except Exception:
                continue
        return results[:top_k]

    async def create(self, content: str, user_id: str = "default", metadata: Optional[dict] = None) -> Memory:
        filename = (metadata or {}).get("filename") or f"{uuid.uuid4().hex[:8]}.md"
        path = self.root / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return self._read(path)

    async def update(self, memory_id: str, content: str, metadata: Optional[dict] = None) -> Memory:
        path = self._id_to_path(memory_id)
        if not path.exists():
            raise FileNotFoundError(f"No file at {path}")
        path.write_text(content, encoding="utf-8")
        return self._read(path)

    async def delete(self, memory_id: str) -> None:
        path = self._id_to_path(memory_id)
        if path.exists():
            path.unlink()

    async def stats(self, user_id: str = "default") -> MemoryStats:
        paths = self._scan()
        by_ext: dict[str, int] = {}
        for p in paths:
            by_ext[p.suffix] = by_ext.get(p.suffix, 0) + 1
        return MemoryStats(
            total=len(paths),
            sources={self.name: len(paths)},
            extra={"by_extension": by_ext, "root": str(self.root)},
        )
