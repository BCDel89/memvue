# memvue

A pluggable memory dashboard for [mem0](https://github.com/mem0ai/mem0) and local files.

Browse, search, create, edit, and delete memories across multiple sources — all from one UI.

![memvue screenshot](docs/screenshot.png)

## Features

- **All Memories** — unified view across all adapters, semantic search (↵), substring filter, sort, source filter
- **Local Files** — browse markdown files with frontmatter support, filter, sort, inline edit
- **Graph** — force-directed visualization of memories clustered by source
- **Pluggable adapters** — mem0 and filesystem out of the box; add your own via `MemoryAdapter`
- **Runtime settings UI** — add/remove memory directories and file extensions without restarting

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

| Env var | Default | Description |
|---|---|---|
| `MEM0_URL` | — | Base URL of your mem0 instance (e.g. `http://localhost:8000`) |
| `MEM0_API_KEY` | — | mem0 API key |
| `MEM0_USER_ID` | `default` | Default user ID for mem0 queries |
| `FS_ROOTS` | — | Comma-separated paths to scan for local files |
| `FS_EXTENSIONS` | `.md` | File extensions to include (e.g. `.md,.txt`) |
| `FS_EXCLUDE_DIRS` | — | Comma-separated directory names to skip during scan |
| `FS_MAX_DEPTH` | `6` | Maximum directory depth for filesystem scan |
| `AGENT_NAME` | `agent` | Name of your agent (shown as the root node in Graph view) |
| `GRAPH_ENTRY_POINTS` | `MEMORY.md,CLAUDE.md` | Filenames that anchor the graph layout |
| `CORS_ORIGINS` | `*` | Comma-separated allowed CORS origins |
| `MEMVUE_API_KEY` | — | Optional: lock down the memvue backend with a key |

### Runtime settings

Memory directories and file extensions can also be managed from the **Settings panel** in the UI (gear icon, top-right). Changes persist across restarts via `backend/runtime-config.json` and take effect immediately — no restart needed.

## Writing a custom adapter

```python
from adapters.base import MemoryAdapter, Memory, MemoryStats

class MyAdapter(MemoryAdapter):
    name = "mine"

    async def list(self, user_id, limit=100):
        ...

    async def search(self, query, user_id, top_k=20):
        ...

    def capabilities(self):
        return {"list", "search", "create", "update", "delete"}
```

Register it in `backend/main.py` alongside the existing adapters.

## License

MIT
