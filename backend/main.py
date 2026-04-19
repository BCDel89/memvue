from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from adapters import Memory, MemoryAdapter, MemoryStats, Mem0Adapter, FilesystemAdapter
from config import load_config


# --- build adapter registry from config ---

def _build_adapters() -> dict[str, MemoryAdapter]:
    cfg = load_config()
    adapters: dict[str, MemoryAdapter] = {}
    if cfg.mem0.enabled:
        adapters["mem0"] = Mem0Adapter(cfg.mem0.url, cfg.mem0.api_key)
    for root in cfg.filesystem.roots:
        key = f"fs:{root}"
        adapters[key] = FilesystemAdapter(root, cfg.filesystem.extensions)
    return adapters


_adapters: dict[str, MemoryAdapter] = {}
_config = load_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _adapters
    _adapters = _build_adapters()
    yield


app = FastAPI(title="memvue API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        metadata=m.metadata,
        created_at=m.created_at,
        updated_at=m.updated_at,
    ).model_dump()


# --- routes ---

@app.get("/health")
def health():
    return {"status": "ok", "adapters": list(_adapters.keys())}


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
    all_memories = []
    for adp in targets.values():
        all_memories.extend(await adp.list(user_id=user_id, limit=limit))
    return [_mem(m) for m in all_memories]


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


@app.put("/memories/{adapter_id}/{memory_id:path}")
async def update_memory(adapter_id: str, memory_id: str, req: UpdateRequest, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    if adapter_id not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    m = await _adapters[adapter_id].update(memory_id, req.content, req.metadata)
    return _mem(m)


@app.delete("/memories/{adapter_id}/{memory_id:path}")
async def delete_memory(adapter_id: str, memory_id: str, x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    if adapter_id not in _adapters:
        raise HTTPException(status_code=404, detail=f"Adapter '{adapter_id}' not found")
    await _adapters[adapter_id].delete(memory_id)
    return {"deleted": memory_id, "adapter": adapter_id}


@app.get("/stats")
async def get_stats(user_id: str = Query(default="default"), x_api_key: str = Header(default="")):
    check_auth(x_api_key)
    combined: dict = {"total": 0, "sources": {}}
    for key, adp in _adapters.items():
        s = await adp.stats(user_id=user_id)
        combined["total"] += s.total
        combined["sources"][key] = s.total
        if s.extra:
            combined[key] = s.extra
    return combined
