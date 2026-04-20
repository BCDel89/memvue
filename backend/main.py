from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

from pathlib import Path

from adapters import Memory, MemoryAdapter, MemoryStats, Mem0Adapter, FilesystemAdapter
from config import load_config, load_runtime, save_runtime


# --- build adapter registry from config ---

def _build_adapters() -> dict[str, MemoryAdapter]:
    cfg = load_config()
    adapters: dict[str, MemoryAdapter] = {}
    if cfg.mem0.enabled:
        adapters["mem0"] = Mem0Adapter(cfg.mem0.url, cfg.mem0.api_key)
    for root in cfg.filesystem.roots:
        key = f"fs:{root}"
        adapters[key] = FilesystemAdapter(
            root,
            cfg.filesystem.extensions,
            extra_skip_dirs=cfg.filesystem.exclude_dirs,
            max_depth=cfg.filesystem.max_depth,
        )
    return adapters


_adapters: dict[str, MemoryAdapter] = {}
_config = load_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _adapters
    _adapters = _build_adapters()
    yield


app = FastAPI(title="memvue API", version="0.1.0", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_config.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- auth ---

def check_auth(x_api_key: str = Header(default="")):
    if _config.api_key and x_api_key != _config.api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")


# --- models ---

class MemoryOut(BaseModel):
    id: str
    content: str
    source: str
    metadata: dict = {}
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CreateRequest(BaseModel):
    content: str
    user_id: str = "default"
    metadata: Optional[dict] = None
    adapter: Optional[str] = None


class UpdateRequest(BaseModel):
    content: str
    metadata: Optional[dict] = None


class SearchRequest(BaseModel):
    query: str
    user_id: str = "default"
    top_k: int = 10
    adapter: Optional[str] = None


def _mem(m: Memory) -> dict:
    return MemoryOut(
        id=m.id,
        content=m.content,
        source=m.source,
        metadata=m.metadata or {},
        created_at=m.created_at,
        updated_at=m.updated_at,
    ).model_dump()


# --- routes ---

def _fs_extensions() -> list[str]:
    for adp in _adapters.values():
        if isinstance(adp, FilesystemAdapter):
            return sorted(adp.extensions)
    return list(_config.filesystem.extensions)


def _fs_roots() -> list[str]:
    return [str(adp.root) for adp in _adapters.values() if isinstance(adp, FilesystemAdapter)]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "adapters": list(_adapters.keys()),
        "default_user_id": _config.mem0.user_id or "default",
        "agent_name": _config.agent_name,
        "graph_entry_points": _config.graph_entry_points,
        "fs_extensions": _fs_extensions(),
        "fs_roots": _fs_roots(),
    }


@app.get("/adapters")
def list_adapters(x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    return [
        {"id": k, "name": v.name, "capabilities": list(v.capabilities())}
        for k, v in _adapters.items()
    ]


@app.get("/memories")
async def list_memories(
    user_id: str = Query(default="default"),
    limit: int = Query(default=1000),
    adapter: Optional[str] = Query(default=None),
    x_api_key: str = Header(default=""),
):
    check_auth(x_api_key)
    targets = {adapter: _adapters[adapter]} if adapter and adapter in _adapters else _adapters
    if adapter and adapter not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter}' not found")
    results = await asyncio.gather(*[adp.list(user_id=user_id, limit=limit) for adp in targets.values()])
    return [_mem(m) for ms in results for m in ms]


@app.post("/memories/search")
async def search_memories(req: SearchRequest, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    targets = {req.adapter: _adapters[req.adapter]} if req.adapter and req.adapter in _adapters else _adapters
    if req.adapter and req.adapter not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{req.adapter}' not found")
    results = []
    for adp in targets.values():
        results.extend(await adp.search(req.query, user_id=req.user_id, top_k=req.top_k))
    return [_mem(m) for m in results]


@app.post("/memories")
async def create_memory(req: CreateRequest, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    adapter_id = req.adapter
    if not adapter_id:
        if not _adapters:
            raise HTTPException(status_code=400, detail="No adapters configured")
        adapter_id = next(iter(_adapters))
    if adapter_id not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    m = await _adapters[adapter_id].create(req.content, user_id=req.user_id, metadata=req.metadata)
    return _mem(m)


@app.put("/memories/{memory_id:path}")
async def update_memory(memory_id: str, req: UpdateRequest, adapter_id: str = Query(...), x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    if adapter_id not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    m = await _adapters[adapter_id].update(memory_id, req.content, req.metadata)
    return _mem(m)


@app.delete("/memories/{memory_id:path}")
async def delete_memory(memory_id: str, adapter_id: str = Query(...), x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    if adapter_id not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    await _adapters[adapter_id].delete(memory_id)
    return {"deleted": memory_id, "adapter": adapter_id}


class ConfigPatch(BaseModel):
    fs_extensions: Optional[list[str]] = None


class FsRootRequest(BaseModel):
    path: str


@app.patch("/config")
async def patch_config(patch: ConfigPatch, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    runtime = load_runtime()
    if patch.fs_extensions is not None:
        exts = [e if e.startswith(".") else f".{e}" for e in patch.fs_extensions if e.strip()]
        runtime["fs_extensions"] = exts
        for adp in _adapters.values():
            if isinstance(adp, FilesystemAdapter):
                adp.update_extensions(exts)
    save_runtime(runtime)
    return {"ok": True, "fs_extensions": _fs_extensions(), "fs_roots": _fs_roots()}


@app.post("/config/fs-roots")
async def add_fs_root(req: FsRootRequest, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    raw = req.path.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="path is required")

    resolved = str(Path(raw).expanduser().resolve())
    key = f"fs:{resolved}"
    if key in _adapters:
        return {"ok": True, "fs_roots": _fs_roots()}

    _adapters[key] = FilesystemAdapter(
        resolved,
        list(_fs_extensions()),
        extra_skip_dirs=_config.filesystem.exclude_dirs,
        max_depth=_config.filesystem.max_depth,
    )

    runtime = load_runtime()
    runtime["fs_roots"] = _fs_roots()
    save_runtime(runtime)
    return {"ok": True, "fs_roots": _fs_roots()}


@app.delete("/config/fs-roots")
async def remove_fs_root(path: str = Query(...), x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    resolved = str(Path(path).expanduser().resolve())
    key = f"fs:{resolved}"
    _adapters.pop(key, None)

    runtime = load_runtime()
    runtime["fs_roots"] = _fs_roots()
    save_runtime(runtime)
    return {"ok": True, "fs_roots": _fs_roots()}


@app.get("/stats")
async def get_stats(user_id: str = Query(default="default"), x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    keys = list(_adapters.keys())
    stats_list = await asyncio.gather(*[adp.stats(user_id=user_id) for adp in _adapters.values()])
    combined: dict = {"total": 0, "sources": {}}
    for key, s in zip(keys, stats_list):
        combined["total"] += s.total
        combined["sources"][key] = s.total
        if s.extra:
            combined[key] = s.extra
    return combined
