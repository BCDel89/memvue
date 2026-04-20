from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Load .env from backend dir or repo root (whichever exists first)
for _env in (Path(__file__).parent / ".env", Path(__file__).parent.parent / ".env"):
    if _env.exists():
        with open(_env) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _, _v = _line.partition("=")
                    os.environ.setdefault(_k.strip(), _v.strip())
        break


@dataclass
class Mem0Config:
    url: str = ""
    api_key: str = ""
    user_id: str = "default"
    enabled: bool = False


@dataclass
class FilesystemConfig:
    roots: list[str] = field(default_factory=list)
    extensions: list[str] = field(default_factory=lambda: [".md", ".txt"])
    exclude_dirs: list[str] = field(default_factory=list)
    max_depth: int = 6
    enabled: bool = False


@dataclass
class AppConfig:
    api_key: str
    mem0: Mem0Config
    filesystem: FilesystemConfig
    agent_name: str = "agent"
    cors_origins: list[str] = field(default_factory=lambda: ["*"])
    graph_entry_points: list[str] = field(default_factory=lambda: ["MEMORY.md", "CLAUDE.md"])


def load_config() -> AppConfig:
    mem0_url = os.environ.get("MEM0_URL", "")
    mem0_key = os.environ.get("MEM0_API_KEY", "")
    fs_roots_raw = os.environ.get("FS_ROOTS", "")
    fs_roots = [r.strip() for r in fs_roots_raw.split(",") if r.strip()] if fs_roots_raw else []
    fs_exts_raw = os.environ.get("FS_EXTENSIONS", ".md,.txt")
    fs_exts = [e.strip() for e in fs_exts_raw.split(",") if e.strip()]
    fs_exclude_raw = os.environ.get("FS_EXCLUDE_DIRS", "")
    fs_exclude = [d.strip() for d in fs_exclude_raw.split(",") if d.strip()]
    fs_max_depth = int(os.environ.get("FS_MAX_DEPTH", "6"))
    cors_raw = os.environ.get("CORS_ORIGINS", "*")
    cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]
    entry_raw = os.environ.get("GRAPH_ENTRY_POINTS", "MEMORY.md,CLAUDE.md")
    entry_points = [e.strip() for e in entry_raw.split(",") if e.strip()]

    return AppConfig(
        api_key=os.environ.get("MEMVUE_API_KEY", ""),
        agent_name=os.environ.get("AGENT_NAME", "agent"),
        cors_origins=cors_origins,
        graph_entry_points=entry_points,
        mem0=Mem0Config(
            url=mem0_url,
            api_key=mem0_key,
            user_id=os.environ.get("MEM0_USER_ID", "default"),
            enabled=bool(mem0_url and mem0_key),
        ),
        filesystem=FilesystemConfig(
            roots=fs_roots,
            extensions=fs_exts,
            exclude_dirs=fs_exclude,
            max_depth=fs_max_depth,
            enabled=bool(fs_roots),
        ),
    )
