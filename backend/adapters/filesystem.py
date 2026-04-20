from __future__ import annotations

import asyncio
import os
import re
import time
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


def _do_scan(root: Path, extensions: set[str], skip_dirs: set[str], max_depth: int) -> list[Path]:
    results: list[Path] = []
    stack: list[tuple[Path, int]] = [(root, 0)]
    while stack:
        current, depth = stack.pop()
        try:
            entries = list(current.iterdir())
        except PermissionError:
            continue
        for entry in entries:
            if entry.name in skip_dirs:
                continue
            if entry.is_dir():
                if depth < max_depth:
                    stack.append((entry, depth + 1))
            elif entry.is_file() and entry.suffix in extensions:
                results.append(entry)
    return results


class FilesystemAdapter(MemoryAdapter):
    name = "filesystem"

    _BASE_SKIP_DIRS = {
        "node_modules", ".git", "venv", ".venv", "__pycache__",
        ".next", "dist", "build", "build_out",
        "Pods", "platforms", "DerivedData",
        ".nvm", ".oh-my-zsh", ".space-vim", ".local",
        ".Trash", "Library",
    }
    _CACHE_TTL = 60  # seconds

    def __init__(
        self,
        root: str,
        extensions: list[str] | None = None,
        extra_skip_dirs: list[str] | None = None,
        max_depth: int = 6,
    ):
        self.root = Path(root).expanduser().resolve()
        self.extensions = set(extensions or [".md", ".txt"])
        self.skip_dirs = self._BASE_SKIP_DIRS | set(extra_skip_dirs or [])
        self.max_depth = max_depth
        self.adapter_id = f"fs:{self.root}"
        self._scan_cache: list[Path] = []
        self._scan_ts: float = 0.0
        self._scan_lock: asyncio.Lock | None = None

    def _get_lock(self) -> asyncio.Lock:
        if self._scan_lock is None:
            self._scan_lock = asyncio.Lock()
        return self._scan_lock

    async def _scan(self) -> list[Path]:
        now = time.monotonic()
        if now - self._scan_ts < self._CACHE_TTL:
            return self._scan_cache
        async with self._get_lock():
            # re-check after acquiring lock
            now = time.monotonic()
            if now - self._scan_ts < self._CACHE_TTL:
                return self._scan_cache
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None, _do_scan, self.root, self.extensions, self.skip_dirs, self.max_depth
            )
            self._scan_cache = results
            self._scan_ts = time.monotonic()
            return results

    def _path_to_id(self, path: Path) -> str:
        return str(path.relative_to(self.root))

    def _id_to_path(self, memory_id: str) -> Path:
        path = (self.root / memory_id).resolve()
        if not str(path).startswith(str(self.root)):
            raise ValueError(f"Invalid memory_id: path traversal detected")
        return path

    def _read(self, path: Path) -> Memory:
        text = path.read_text(encoding="utf-8", errors="replace")
        meta, body = _parse_frontmatter(text)
        rel = self._path_to_id(path)
        return Memory(
            id=rel,
            content=body.strip(),
            source=self.adapter_id,
            metadata={**meta, "path": str(path), "filename": path.name},
            created_at=_mtime(path),
            updated_at=_mtime(path),
        )

    async def list(self, user_id: str = "default", limit: int = 1000) -> list[Memory]:
        paths = sorted(await self._scan(), key=lambda p: p.stat().st_mtime, reverse=True)
        return [self._read(p) for p in paths[:limit]]

    async def get(self, memory_id: str) -> Memory:
        path = self._id_to_path(memory_id)
        if not path.exists():
            raise FileNotFoundError(f"No file at {path}")
        return self._read(path)

    async def search(self, query: str, user_id: str = "default", top_k: int = 10) -> list[Memory]:
        q = query.lower()
        results = []
        for path in await self._scan():
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
        self._scan_ts = 0.0  # invalidate cache
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
        self._scan_ts = 0.0  # invalidate cache

    async def stats(self, user_id: str = "default") -> MemoryStats:
        paths = await self._scan()
        by_ext: dict[str, int] = {}
        for p in paths:
            by_ext[p.suffix] = by_ext.get(p.suffix, 0) + 1
        return MemoryStats(
            total=len(paths),
            sources={self.name: len(paths)},
            extra={"by_extension": by_ext, "root": str(self.root)},
        )
