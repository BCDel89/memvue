# Multi-Tenancy in memvue (V2.3)

memvue V2.3 introduces first-class workspace support, making it straightforward to run a single server that serves multiple users or projects without code changes.

---

## What changed

### Backend

All query defaults that previously hardcoded `"default"` as the `user_id` now derive from server configuration:

```python
# Before (V2.2 and earlier)
user_id: str = Query(default="default")

# After (V2.3)
user_id: str = Query(default=_config.workspace)
```

This affects every endpoint that accepts a `user_id` parameter:

- `GET /memories`
- `GET /memory/{memory_id}`
- `POST /memories`
- `PUT /memory/{memory_id}`
- `DELETE /memory/{memory_id}`
- `POST /search`
- `GET /stats`

### Environment variable

`MEMVUE_WORKSPACE` sets the server's default workspace. When a client omits `user_id` from a request, this value is used.

```bash
MEMVUE_WORKSPACE=alice uvicorn backend.main:app
```

If unset, the default remains `"default"` for backwards compatibility.

### Frontend

A workspace selector now appears in the top bar (the `@username` pill). It lets you:

- See the current workspace at a glance
- Switch to any recent workspace with one click
- Type a new workspace name and press Enter to switch
- The last 10 used workspaces are persisted in `localStorage` under `memvue_workspaces`

Switching workspace triggers a full data refresh — the memory list, stats, and search results all reload for the new workspace.

---

## Migrating from V2.2

### If you ran a single-user instance

No action required. The behaviour is identical — the default workspace is `"default"` unless you set `MEMVUE_WORKSPACE`.

### If you want to rename the default workspace

Set the env var before starting the server:

```bash
MEMVUE_WORKSPACE=myproject uvicorn backend.main:app --reload
```

The frontend will pick up the workspace name from `GET /health` (`workspace` field) on first load and add it to recents automatically.

### If you want per-user isolation

Run separate server instances, each with a distinct `MEMVUE_WORKSPACE`, or pass `user_id` explicitly in every API call. There is no authentication layer in V2.3 — workspace isolation is by convention, not enforcement.

---

## API reference

`GET /health` now returns `workspace`:

```json
{
  "status": "ok",
  "adapters": ["mem0"],
  "workspace": "alice",
  "agent_name": "...",
  ...
}
```

All memory endpoints accept `user_id` as a query parameter. When omitted, the server's configured workspace is used:

```
GET /memories?user_id=bob          # explicit
GET /memories                      # uses MEMVUE_WORKSPACE
```

---

## Roadmap

Full tenant management (create/delete/list workspaces, access control) is out of scope for V2.3. The goal here is to remove hardcoded assumptions so that multi-workspace usage works without workarounds.
