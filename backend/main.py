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
from llm import LLMAdapter, build_llm_adapter


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
_llm_adapter: LLMAdapter | None = None
_config = load_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _adapters, _llm_adapter
    _adapters = _build_adapters()
    _llm_adapter = build_llm_adapter(load_runtime().get("llm") or {
        "provider": _config.llm.provider,
        "base_url": _config.llm.base_url,
        "api_key": _config.llm.api_key,
        "model": _config.llm.model,
    })
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
    llm_rt = load_runtime().get("llm", {})
    return {
        "status": "ok",
        "adapters": list(_adapters.keys()),
        "default_user_id": _config.mem0.user_id or "default",
        "agent_name": _config.agent_name,
        "graph_entry_points": _config.graph_entry_points,
        "fs_extensions": _fs_extensions(),
        "fs_roots": _fs_roots(),
        "llm": {
            "provider": llm_rt.get("provider", ""),
            "base_url": llm_rt.get("base_url", ""),
            "model": llm_rt.get("model", ""),
            "has_api_key": bool(llm_rt.get("api_key")),
        },
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


def _jaccard(a: str, b: str) -> float:
    sa = set(a.lower().split())
    sb = set(b.lower().split())
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


@app.get("/memories/duplicates")
async def find_duplicates(
    user_id: str = Query(default="default"),
    threshold: float = Query(default=0.5, ge=0.0, le=1.0),
    limit: int = Query(default=500, le=2000),
    x_api_key: str = Header(default=""),
):
    check_auth(x_api_key)
    adapter_items = list(_adapters.items())
    results = await asyncio.gather(*[adp.list(user_id=user_id, limit=limit) for _, adp in adapter_items])

    all_mems: list[tuple] = []
    for (adapter_key, _), mems in zip(adapter_items, results):
        for m in mems:
            all_mems.append((m, adapter_key))

    n = len(all_mems)
    clusters: list[list[dict]] = []
    used: set[int] = set()

    for i in range(n):
        if i in used:
            continue
        m_a, ak_a = all_mems[i]
        group = [{**_mem(m_a), "adapter_id": ak_a}]
        group_indices = [i]
        for j in range(i + 1, n):
            if j in used:
                continue
            m_b, ak_b = all_mems[j]
            if _jaccard(m_a.content, m_b.content) >= threshold:
                group.append({**_mem(m_b), "adapter_id": ak_b})
                group_indices.append(j)
        if len(group) > 1:
            for idx in group_indices:
                used.add(idx)
            clusters.append(group)

    return {"clusters": clusters, "count": len(clusters)}


class MergeRequest(BaseModel):
    keep_id: str
    keep_adapter: str
    discard_id: str
    discard_adapter: str
    merged_content: Optional[str] = None


@app.post("/memories/merge")
async def merge_memories(req: MergeRequest, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    if req.keep_adapter not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{req.keep_adapter}' not found")
    if req.discard_adapter not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{req.discard_adapter}' not found")
    if req.merged_content:
        await _adapters[req.keep_adapter].update(req.keep_id, req.merged_content, None)
    await _adapters[req.discard_adapter].delete(req.discard_id)
    return {"merged": True, "kept": req.keep_id, "discarded": req.discard_id}


@app.get("/memories/{memory_id:path}")
async def get_memory(memory_id: str, adapter_id: str = Query(...), x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    if adapter_id not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    try:
        m = await _adapters[adapter_id].get(memory_id)
    except (FileNotFoundError, KeyError, Exception) as e:
        raise HTTPException(status_code=404, detail=str(e))
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


@app.get("/features")
async def get_features():
    configured = _llm_adapter is not None
    return {
        "llm_configured": configured,
        "llm_provider": getattr(_llm_adapter, "name", "") if _llm_adapter else "",
        "llm_model": getattr(_llm_adapter, "model", "") if _llm_adapter else "",
        "ai_ingest": configured,
        "ai_tagging": configured,
        "ai_digest": configured,
        "consolidation": True,
        "duplicates": True,
        "staleness": True,
        "analytics": True,
    }


_LLM_PROVIDERS = [
    {"id": "ollama", "label": "Ollama (local)", "fields": ["base_url", "model"]},
    {"id": "openai_compatible", "label": "OpenAI-compatible (OpenRouter, Groq, LM Studio…)", "fields": ["base_url", "api_key", "model"]},
    {"id": "anthropic", "label": "Anthropic", "fields": ["api_key", "model"]},
]


@app.get("/llm/providers")
async def list_llm_providers(x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    return _LLM_PROVIDERS


@app.get("/config/llm")
async def get_llm_config(x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    rt = load_runtime()
    cfg = rt.get("llm", {})
    return {
        "provider": cfg.get("provider", _config.llm.provider),
        "base_url": cfg.get("base_url", _config.llm.base_url),
        "api_key": cfg.get("api_key", _config.llm.api_key),
        "model": cfg.get("model", _config.llm.model),
    }


class LLMConfigPatch(BaseModel):
    provider: str = ""
    base_url: str = ""
    api_key: str = ""
    model: str = ""


@app.patch("/config/llm")
async def patch_llm_config(patch: LLMConfigPatch, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    global _llm_adapter
    runtime = load_runtime()
    runtime["llm"] = {
        "provider": patch.provider,
        "base_url": patch.base_url,
        "api_key": patch.api_key,
        "model": patch.model,
    }
    save_runtime(runtime)
    _llm_adapter = build_llm_adapter(runtime["llm"])
    return {"ok": True, "llm_configured": _llm_adapter is not None}


@app.post("/llm/test")
async def test_llm(x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    if _llm_adapter is None:
        return {"ok": False, "error": "No LLM configured"}
    try:
        ok = await _llm_adapter.health()
        return {
            "ok": ok,
            "provider": _llm_adapter.name,
            "model": getattr(_llm_adapter, "model", ""),
            "error": None if ok else "Health check failed",
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


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
