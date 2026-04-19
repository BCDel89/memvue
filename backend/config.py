import os
from dataclasses import dataclass, field


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
    enabled: bool = False


@dataclass
class AppConfig:
    api_key: str
    mem0: Mem0Config
    filesystem: FilesystemConfig


def load_config() -> AppConfig:
    mem0_url = os.environ.get("MEM0_URL", "")
    mem0_key = os.environ.get("MEM0_API_KEY", "")
    fs_roots_raw = os.environ.get("FS_ROOTS", "")
    fs_roots = [r.strip() for r in fs_roots_raw.split(",") if r.strip()] if fs_roots_raw else []
    fs_exts_raw = os.environ.get("FS_EXTENSIONS", ".md,.txt")
    fs_exts = [e.strip() for e in fs_exts_raw.split(",") if e.strip()]

    return AppConfig(
        api_key=os.environ.get("MEMVUE_API_KEY", ""),
        mem0=Mem0Config(
            url=mem0_url,
            api_key=mem0_key,
            user_id=os.environ.get("MEM0_USER_ID", "default"),
            enabled=bool(mem0_url and mem0_key),
        ),
        filesystem=FilesystemConfig(
            roots=fs_roots,
            extensions=fs_exts,
            enabled=bool(fs_roots),
        ),
    )
