# memvue

**Your AI agents remember things. MemVue helps you manage that.**

A visual memory hub for [mem0](https://github.com/mem0ai/mem0) and local markdown files — browse, search, clean, and sync memories across AI agent frameworks from one UI.

Works in any browser — desktop or mobile.

![memvue files tab](docs/screenshots/02-files-tab.png)

---

## The problem

If you've run multiple AI agents, you've probably felt this:

- Memory files scattered across frameworks — Claude Code, Cline, OpenClaw, and more all store things differently
- Switch to a new agent harness and start from zero, or manually port dozens of files
- No way to see what your agents actually know — or what's stale, conflicting, or redundant
- mem0 is powerful but opaque without a UI

MemVue was built to solve exactly this. One central place to see, manage, and sync memory — whether it's raw markdown files or mem0's semantic layer.

---

## How it works

```
  Filesystem files  ──── sync ────►  mem0 (AI layer)
  (.md, .txt, etc.)                   semantic facts
       ↑                                    ↑
  source of truth              deduplicated, searchable
```

MemVue bridges two memory systems:

- **Filesystem (Files tab)** — reads your actual markdown files. The source of truth. Edits show up immediately.
- **mem0 (All tab)** — the AI layer. When you sync a file, mem0 runs it through an LLM and extracts meaningful facts, merging them with what it already knows.

---

## Features

**Browse & search**
- Unified view of all memories across all adapters
- Semantic search, substring filter, sort by newest/oldest/length
- Filter by source, tag, category, or staleness
- Expandable cards showing full content, path, timestamps, word count

![memvue all tab](docs/screenshots/01-all-tab.png)

**Sync filesystem → mem0**
- Per-file sync status: `↑ mem0` / `↑ changes` (modified) / `✓ synced`
- Hash-based change tracking in localStorage — knows what changed since last sync
- Sync confirmation modal explains what mem0 does before you commit
- Bulk sync or per-card sync

**Memory hygiene**
- Flag mem0 memories as stale; mark as reviewed once triaged
- Tag editor per memory — add/edit/remove tags inline
- Consolidation tab to merge duplicate or related memories

**Full CRUD**
- Create, edit, and delete memories in both mem0 and filesystem
- Markdown editor with live preview
- Smart tagging — LLM suggests tags while composing (requires LLM config)

**Graph view**
- Force-directed graph of memories clustered by source
- Resolves `mem0://uuid` cross-links directly

**Settings**
- Add/remove filesystem directories without restarting
- Configure LLM provider (Ollama, Anthropic, OpenRouter, or any OpenAI-compatible API)
- Multi-workspace support via `@workspace` selector

---

## Memory graph

Most memory tools are a flat list. MemVue's graph shows how your memories connect.

Each node is a file or mem0 memory. Edges come from `mem0://uuid` cross-links in your markdown — MemVue resolves them directly so you can see the actual web of context your agents are building up. Clusters form naturally by source: `fs:memory`, `fs:workspace`, `mem0`.

Click any node to inspect it inline, edit or delete without leaving the graph, and drill into linked nodes. It's the fastest way to spot what's redundant, what's well-connected, and what's floating in isolation.

![memvue graph view](docs/screenshots/05-graph-view.png)

<details>
<summary>Mobile</summary>

![memvue graph mobile](docs/screenshots/mobile-graph.png)
![memvue all tab mobile](docs/screenshots/mobile-all.png)

</details>

---

## Agentic setup

Let your AI agent do the setup. Paste this into Claude Code (or any capable agent) and it'll detect your existing memory directories, configure `.env`, and launch MemVue:

```
Set up MemVue for me.

1. Clone https://github.com/BCDel89/memvue into a local directory of your choice
2. Find all directories on this machine that contain AI agent memory files — look for .claude, .cline, .continue, and any other agent config dirs with .md memory files
3. Copy .env.example to .env and fill it in:
   - Set FS_ROOTS to a comma-separated list of every memory directory you found
   - Leave MEM0_URL/MEM0_API_KEY blank if I don't have a mem0 account yet
4. Update docker-compose.yml to mount each FS_ROOTS path as a read-only volume
5. Run: docker compose up -d
6. Open http://localhost:5173 and confirm the Files tab shows my memory files

If docker isn't available, run the backend and frontend locally per the README.
Report what you found and any steps that need my input (API keys, etc.).
```

Claude will scan your system, wire up the config, and hand you a running MemVue pointed at your actual memory files.

---

## Quickstart

```bash
cp .env.example .env
# Fill in MEM0_URL, MEM0_API_KEY, and FS_ROOTS
docker compose up -d
```

Open http://localhost:5173

> **Volumes:** For Docker to see your files, mount each path in `FS_ROOTS` as a volume. See the comment block in `docker-compose.yml`.

---

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

---

## Configuration

| Env var | Default | Description |
|---|---|---|
| `MEM0_URL` | — | mem0 base URL (e.g. `https://api.mem0.ai` or `http://localhost:8888`) |
| `MEM0_API_KEY` | — | mem0 API key |
| `MEM0_USER_ID` | `default` | User/workspace to scope memories under |
| `FS_ROOTS` | — | Comma-separated absolute paths to scan for files |
| `FS_EXTENSIONS` | `.md` | File extensions to include (e.g. `.md,.txt`) |
| `FS_EXCLUDE_DIRS` | — | Directory names to skip (merged with built-in defaults) |
| `FS_MAX_DEPTH` | `6` | Max directory recursion depth |
| `LLM_PROVIDER` | — | `ollama` / `openai_compatible` / `anthropic` |
| `LLM_BASE_URL` | — | Base URL for Ollama or OpenAI-compatible providers |
| `LLM_API_KEY` | — | API key for LLM provider |
| `LLM_MODEL` | — | Model name (e.g. `gemma3:4b`, `claude-haiku-4-5-20251001`) |
| `AGENT_NAME` | `agent` | Label shown on the root node in Graph view |
| `MEMVUE_API_KEY` | — | Optional: lock the backend API with a key |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |

Settings can also be managed live from the **Settings panel** in the UI — no restart needed.

---

## Claude Code skill

MemVue pairs well with a Claude Code skill that gives your AI assistant full context about how the app works — mem0 dedup behavior, sync tracking, memory-friendly file patterns, and troubleshooting tips.

```bash
npx skills add bcdel89/memvue -a claude-code
```

The skill loads automatically whenever you're working with memories.

---

## Roadmap

- [ ] **Proactive memory hygiene** — LLM-powered suggestions to consolidate duplicates, flag stale entries, and keep context lean
- [ ] **Digest notifications** — weekly summary of what your agents learned, what's redundant, what needs review
- [ ] **More adapters** — Notion, Obsidian, custom REST endpoints
- [ ] **Smart dedup UI** — visual diff of near-duplicate memories before merge

---

## Writing a custom adapter

```python
from adapters.base import MemoryAdapter, Memory, MemoryStats

class MyAdapter(MemoryAdapter):
    name = "mine"

    async def list(self, user_id, limit=100): ...
    async def search(self, query, user_id, top_k=20): ...

    def capabilities(self):
        return {"list", "search", "create", "update", "delete"}
```

Register it in `backend/main.py` alongside the existing adapters.

---

## License

MIT — free to use, fork, and build on.

---

*Built by [@BCDel89](https://github.com/BCDel89). If it's useful, [a coffee keeps it going](https://buymeacoffee.com/bcdel89) ☕*
