---
name: memvue
description: Guide for working with MemVue — a memory management UI for mem0 and filesystem-based memories. Trigger when user mentions "memvue", "mem0 sync", "syncing files to mem0", "memory management", "memory viewer", "fs memories", "stale memory", "sync status", or asks about how MemVue works.
---

# MemVue

MemVue is an open-source UI for browsing, managing, and syncing memories across two layers: **mem0** (AI semantic layer) and **filesystem files** (raw markdown/text).

## Architecture

```
Filesystem files  ──sync──►  mem0 (AI layer)
   (.md, .txt)                  ↕
   raw content             semantic facts
```

**Filesystem (fs)** — raw files from directories you configure. MemVue reads them directly. Changes on disk are reflected immediately on refresh. These are the source of truth.

**mem0** — an AI memory layer that *extracts facts* from content rather than storing it verbatim. When you sync a file, mem0 runs it through an LLM and stores the extracted knowledge. Identical content is deduplicated (NOOP) — this is intentional, not a bug.

## Sync Workflow

Sync state is tracked client-side in `localStorage` keyed by `memvue_sync::{userId}::{filePath}`. Each file gets an FNV-1a hash of its content stored after a successful sync.

**Sync statuses per card:**
- **↑ mem0** — never synced
- **↑ changes** (amber) — file was modified since last sync
- **✓ synced** (green) — content unchanged since last successful sync

Because mem0 deduplicates, re-syncing identical content won't create new entries — it NOOPs. The sync tracker uses localStorage specifically to avoid depending on mem0's response for state tracking.

## Writing Memory-Friendly Files

Files sync more effectively when written in clear, factual paragraphs:

- **Prefer short atomic facts** over long prose — mem0 extracts better
- **Use headers** to separate topics so mem0 can chunk cleanly
- **Frontmatter** is stripped by the FS adapter before syncing
- **Avoid filler** — mem0 treats each paragraph as a candidate memory

Example of a well-structured memory file:
```markdown
# Project: memvue

memvue is built with FastAPI backend + React/Vite frontend.
The backend runs at port 7700 by default.

## Key conventions
Filesystem roots are configured via FS_ROOTS env var.
The mem0 adapter connects to MEM0_URL with MEM0_API_KEY.
Memories are scoped per user_id (workspace in the UI).
```

## Common Workflows

**Browse and filter memories**
Open the All tab. Use the search bar to filter by content. Use tag filters or the staleness filter to find memories that need attention.

**Sync files to mem0**
Open the Files tab. Files show sync status on each card. Hit "↑ mem0" on individual files or use the bulk "↑ mem0" toolbar button. A confirmation modal explains the operation before proceeding.

**Mark a mem0 memory as stale**
Open the All tab, find a mem0 memory, expand its action buttons, click "flag". The stale badge appears. Once you've reviewed it, click "reviewed ✓" to clear.

**Add a filesystem root**
Go to Settings → Memory Directories. Enter the full path and click Add. MemVue rescans on save.

**Configure LLM for AI features**
Settings → AI Features. Supports Ollama (local), OpenRouter, Anthropic, or any OpenAI-compatible endpoint. LLM enables smart tagging, ingest, and digest features.

## Troubleshooting

**"Syncing 0 of N…" appears stuck**
mem0 runs an LLM on each file — it takes time. The spinner is normal. Large files or slow models will take longer.

**Files show "↑ mem0" even after syncing**
If the page was refreshed or the localStorage was cleared, sync state is lost. Re-syncing will re-send to mem0 (mem0 will NOOP if content hasn't changed) and restore the hash.

**mem0 order doesn't change after sync**
Expected — mem0 sort is by `updated_at`. If mem0 NOOPs (deduplicated), timestamps don't change and order stays the same.

**`crypto.subtle` error**
MemVue requires a secure context. Access via `localhost` or HTTPS. Accessing by hostname over plain HTTP will break certain browser APIs.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python), httpx |
| Memory adapters | mem0 (via REST API), Filesystem |
| Sync tracking | localStorage (FNV-1a hash per file) |
