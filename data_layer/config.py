"""Settings for the data layer: exported environment variables first, then the repo's .env file."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / ".env"
MODES = ("fake", "sample", "live")

_loaded = False
_from_file: set = set()
_from_shell: set = set()


def load_env(path: Optional[Path] = None) -> None:
    """Read KEY=VALUE lines from .env. Variables already exported in the shell are kept."""
    global _loaded
    if _loaded:
        return
    _loaded = True
    env_path = path or ENV_FILE
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key in os.environ and key not in _from_file:
            _from_shell.add(key)
        else:
            os.environ[key] = value
            _from_file.add(key)


def get(name: str, default: Optional[str] = None) -> Optional[str]:
    load_env()
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def get_int(name: str, default: int) -> int:
    raw = get(name)
    try:
        return int(raw) if raw is not None else default
    except ValueError:
        raise ValueError(f"{name} must be an integer, got {raw!r}")


def mode() -> str:
    value = (get("DOMINO_DATA_MODE", "fake") or "fake").lower()
    if value not in MODES:
        raise ValueError(f"DOMINO_DATA_MODE must be one of {MODES}, got {value!r}")
    return value


def shell_overrides() -> list:
    """Names set in both the shell and .env; the shell value wins, which is easy to miss."""
    load_env()
    return sorted(_from_shell)


def repo_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else REPO_ROOT / path
