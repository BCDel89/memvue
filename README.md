# memvue

A pluggable memory dashboard for [mem0](https://github.com/mem0ai/mem0) and local files.

Browse, search, create, edit, and delete memories across multiple sources — all from one UI.

![memvue screenshot](docs/screenshot.png)

## Features

- **All Memories** — unified view across all adapters, semantic search (↵), substring filter, sort, source filter
- **Local Files** — browse markdown/text files with frontmatter support
- **Graph** — force-directed visualization of memories clustered by source
- **Pluggable adapters** — mem0 and filesystem out of the box; add your own via `MemoryAdapter`

## Quickstart

```bash
cp .env.example .env
# edit .env with your mem0 URL and/or local file paths
docker compose up
```

Frontend: http://localhost:5173  
Backend API: http://localhost:7700

## Local development

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env  # edit as needed
uvicorn main:app --reload --port 7700
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

## Configuration

| Env var | Description |
|---|---|
| `MEM0_URL` | Base URL of your mem0 instance (e.g. `http://localhost:8000`) |
| `MEM0_API_KEY` | mem0 API key |
| `MEM0_USER_ID` | Default user ID for mem0 queries |
| `FS_ROOTS` | Comma-separated paths to scan for local files |
| `FS_EXTENSIONS` | File extensions to include (default: `.md,.txt`) |
| `MEMVUE_API_KEY` | Optional: lock down the memvue backend with a key |

## Writing a custom adapter

```python
from adapters.base import MemoryAdapter, Memory, MemoryStats

class MyAdapter(MemoryAdapter):
    name = "mine"

    async def list(self, user_id, limit=100):
        ...

    async def search(self, query, user_id, top_k=20):
        ...

    # implement the rest of the interface
    def capabilities(self):
        return {"list", "search", "create", "update", "delete"}
```

Register it in `backend/config.py` alongside the existing adapters.

## License

MIT
