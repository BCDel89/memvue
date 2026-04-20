#!/usr/bin/env python3
"""
Consolidate mem0 memories sharing a source_file into one memory per file.

Usage:
  python scripts/consolidate_daily.py                                 # dry run, dates only
  python scripts/consolidate_daily.py --apply                         # execute
  python scripts/consolidate_daily.py --pattern '^infra/.*\\.md$' --apply  # custom pattern
  python scripts/consolidate_daily.py --all --apply                   # any shared source_file

Reads credentials from ../.env (repo root).
"""

import argparse
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

# Load .env from repo root
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

MEMVUE_URL   = os.environ.get("MEMVUE_URL", "http://localhost:7700")
MEM0_URL     = os.environ.get("MEM0_URL", "http://localhost:8081")
MEM0_API_KEY = os.environ["MEM0_API_KEY"]
MEM0_USER_ID = os.environ.get("MEM0_USER_ID", "sage")

MEM0_HEADERS = {"x-api-key": MEM0_API_KEY, "Content-Type": "application/json"}
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}\.md$"
MAX_CHARS    = 6000  # ~1500 tokens — nomic-embed-text arch limit is 2048


def list_all() -> list[dict]:
    r = requests.get(
        f"{MEMVUE_URL}/memories",
        params={"adapter_id": "mem0", "user_id": MEM0_USER_ID, "limit": 10000},
    )
    r.raise_for_status()
    return r.json()


def add_raw(content: str, metadata: dict) -> dict:
    r = requests.post(f"{MEM0_URL}/memories", headers=MEM0_HEADERS, json={
        "content": content,
        "user_id": MEM0_USER_ID,
        "metadata": metadata,
        "infer": False,
    })
    r.raise_for_status()
    return r.json()


def add_raw_chunked(content: str, metadata: dict) -> list[dict]:
    if len(content) <= MAX_CHARS:
        return [add_raw(content, metadata)]
    parts = [content[i:i+MAX_CHARS] for i in range(0, len(content), MAX_CHARS)]
    return [add_raw(p, {**metadata, "chunk": i+1, "total_chunks": len(parts)}) for i, p in enumerate(parts)]


def delete_mem(mid: str) -> None:
    r = requests.delete(f"{MEM0_URL}/memories/{mid}", headers=MEM0_HEADERS)
    if r.status_code in (404, 500):
        return
    r.raise_for_status()


_DATE_PREFIX_RE = re.compile(r"^\d{4}-\d{2}-\d{2}-(.+)$")


def header_for(source_file: str) -> str:
    """Derive a human-readable H1 header from a source_file path."""
    base = source_file.rsplit("/", 1)[-1].replace(".md", "")
    dir_part = source_file.rsplit("/", 1)[0] if "/" in source_file else ""

    # YYYY-MM-DD.md → "Memory - MM/DD/YY"
    try:
        dt = datetime.strptime(base, "%Y-%m-%d")
        return f"# Memory - {dt.strftime('%m/%d/%y')}"
    except ValueError:
        pass

    # YYYY-MM-DD-descriptive-name.md → strip date prefix → "Descriptive Name"
    m = _DATE_PREFIX_RE.match(base)
    if m:
        title = m.group(1).replace("-", " ").replace("_", " ").title()
        return f"# {title}"

    # infra/access-control.md → "Infra - Access Control"
    title = base.replace("-", " ").replace("_", " ").title()
    if dir_part:
        prefix = dir_part.replace("/", " · ").title()
        return f"# {prefix} - {title}"
    return f"# {title}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="execute (default: dry run)")
    parser.add_argument("--pattern", default=DATE_PATTERN, help="regex for source_file (default: dates)")
    parser.add_argument("--all", action="store_true", help="match all source_files (overrides --pattern)")
    args = parser.parse_args()

    pattern = re.compile(".+" if args.all else args.pattern)

    print(f"Pattern: {pattern.pattern}")
    print("Fetching memories…")
    memories = list_all()
    print(f"  {len(memories)} total")

    groups: dict[str, list[dict]] = defaultdict(list)
    for m in memories:
        sf = (m.get("metadata") or {}).get("source_file", "")
        if sf and pattern.match(sf):
            groups[sf].append(m)

    to_merge = {k: sorted(v, key=lambda m: m.get("created_at") or "") for k, v in groups.items() if len(v) > 1}

    if not to_merge:
        print("Nothing to merge.")
        return

    total_in = sum(len(v) for v in to_merge.values())
    print(f"\n{len(to_merge)} files · {total_in} entries → {len(to_merge)} memories\n")
    for sf, mems in sorted(to_merge.items()):
        print(f"  {sf}  ({len(mems)} → 1)  header: {header_for(sf)!r}")
        for m in mems:
            snippet = m["content"][:72].replace("\n", " ")
            print(f"    [{m['id'][:8]}] {snippet}")

    if not args.apply:
        print(f"\nDry run. Pass --apply to execute.")
        return

    print(f"\nConsolidating…")
    for sf, mems in sorted(to_merge.items()):
        consolidated = [m for m in mems if (m.get("metadata") or {}).get("consolidated_from")]
        originals    = [m for m in mems if not (m.get("metadata") or {}).get("consolidated_from")]
        header = header_for(sf)

        if originals:
            all_content = [m["content"] for m in sorted(mems, key=lambda m: m.get("created_at") or "")]
            combined = header + "\n\n" + "\n\n".join(all_content)
            base_meta = dict(mems[0].get("metadata") or {})
            base_meta["source_file"] = sf
            base_meta["consolidated_from"] = [m["id"] for m in mems]
            base_meta["consolidated_at"] = datetime.now(timezone.utc).isoformat()
            results_list = add_raw_chunked(combined, base_meta)
            chunks_note = f" ({len(results_list)} chunks)" if len(results_list) > 1 else ""
            print(f"  {sf}: created{chunks_note}")
            for m in mems:
                delete_mem(m["id"])
            print(f"    deleted {len(mems)} originals")
        else:
            by_created = sorted(consolidated, key=lambda m: m.get("created_at") or "")
            keeper, dupes = by_created[0], by_created[1:]
            for m in dupes:
                delete_mem(m["id"])
            print(f"  {sf}: kept {keeper['id'][:8]}, deleted {len(dupes)} duplicate(s)")
            if not keeper["content"].startswith("#"):
                requests.put(f"{MEM0_URL}/memories/{keeper['id']}", headers=MEM0_HEADERS,
                    json={"content": header + "\n\n" + keeper["content"], "user_id": MEM0_USER_ID})

    print("\nDone.")


if __name__ == "__main__":
    main()
