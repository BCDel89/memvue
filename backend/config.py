from __future__ import annotations

import json
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


RUNTIME_CONFIG_PATH = Path(__file__).parent / "runtime-config.json"


def load_runtime() -> dict:
    if not RUNTIME_CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(RUNTIME_CONFIG_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def save_runtime(cfg: dict) -> None:
    RUNTIME_CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


@dataclass
class Mem0Config:
    url: str = ""
    api_key: str = ""
    user_id: str = "default"
    enabled: bool = False


@dataclass
class LLMConfig:
    provider: str = ""  # "ollama" | "openai_compatible" | "anthropic"
    base_url: str = ""
    api_key: str = ""
    model: str = ""
    enabled: bool = False


@dataclass
class FilesystemConfig:
    roots: list[str] = field(default_factory=list)
    extensions: list[str] = field(default_factory=lambda: [".md"])
    exclude_dirs: list[str] = field(default_factory=list)
    max_depth: int = 6
    enabled: bool = False


@dataclass
class AppConfig:
    api_key: str
    mem0: Mem0Config
    filesystem: FilesystemConfig
    llm: LLMConfig = field(default_factory=LLMConfig)
    agent_name: str = "agent"
    cors_origins: list[str] = field(default_factory=lambda: ["*"])
    graph_entry_points: list[str] = field(default_factory=lambda: ["MEMORY.md", "CLAUDE.md"])
    support_url: str = ""


def load_config() -> AppConfig:
    runtime = load_runtime()
    mem0_url = os.environ.get("MEM0_URL", "")
    mem0_key = os.environ.get("MEM0_API_KEY", "")

    if "fs_roots" in runtime:
        fs_roots = list(runtime["fs_roots"])
    else:
        fs_roots_raw = os.environ.get("FS_ROOTS", "")
        fs_roots = [r.strip() for r in fs_roots_raw.split(",") if r.strip()] if fs_roots_raw else []

    if "fs_extensions" in runtime:
        fs_exts = list(runtime["fs_extensions"])
    else:
        fs_exts_raw = os.environ.get("FS_EXTENSIONS", ".md")
        fs_exts = [e.strip() for e in fs_exts_raw.split(",") if e.strip()]
    fs_exclude_raw = os.environ.get("FS_EXCLUDE_DIRS", "")
    fs_exclude = [d.strip() for d in fs_exclude_raw.split(",") if d.strip()]
    fs_max_depth = int(os.environ.get("FS_MAX_DEPTH", "6"))
    cors_raw = os.environ.get("CORS_ORIGINS", "*")
    cors_origins = [o.strip() for o in cors_raw.split(",") if o.strip()]
    entry_raw = os.environ.get("GRAPH_ENTRY_POINTS", "MEMORY.md,CLAUDE.md")
    entry_points = [e.strip() for e in entry_raw.split(",") if e.strip()]

    # LLM config — runtime takes precedence over env vars
    llm_rt = runtime.get("llm", {})
    llm_provider = llm_rt.get("provider") or os.environ.get("LLM_PROVIDER", "")
    llm_base_url = llm_rt.get("base_url") or os.environ.get("LLM_BASE_URL", "")
    llm_api_key  = llm_rt.get("api_key")  or os.environ.get("LLM_API_KEY", "")
    llm_model    = llm_rt.get("model")    or os.environ.get("LLM_MODEL", "")

    return AppConfig(
        api_key=os.environ.get("MEMVUE_API_KEY", ""),
        agent_name=os.environ.get("AGENT_NAME", "agent"),
        support_url=os.environ.get("SUPPORT_URL", ""),
        cors_origins=cors_origins,
        graph_entry_points=entry_points,
        llm=LLMConfig(
            provider=llm_provider,
            base_url=llm_base_url,
            api_key=llm_api_key,
            model=llm_model,
            enabled=bool(llm_provider and llm_model),
        ),
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
