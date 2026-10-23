"""Uniform experiment interface: each world case runs as a disposable subprocess with a hard timeout.

A case is `worlds/cases/<world_id>.json`:
  engine    which engine in worlds/engines/<engine>/ runs it
  describe  what the agent may see: components, the change under review, params, metrics (no hints)
  setup     private structural parameters, passed only to the engine
An engine's `run.py --case PATH --variant V --params JSON` prints one JSON object:
  {passed, assertions, metrics, artifacts, logs, input_sha256} or {error}
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config
from .lookups import CONTRACT_VERSION, _fake

WORLDS_DIR = config.REPO_ROOT / "worlds"
VARIANTS = ("baseline", "candidate", "control")
_WORLD_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")


def _envelope(call: str, mode: str) -> Dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "call": call, "mode": mode}


def _roots() -> List[Path]:
    """Repo worlds plus held-out worlds kept in the private folder (see config.private_dir)."""
    return [WORLDS_DIR, config.private_dir() / "worlds"]


def _case_path(world: str) -> Optional[Path]:
    if not _WORLD_ID.match(world):
        return None
    for root in _roots():
        path = root / "cases" / f"{world}.json"
        if path.is_file():
            return path
    return None


def _engine_path(case_path: Path, engine: str) -> Path:
    """An engine next to the case wins; otherwise the repo engine of that name."""
    local = case_path.parents[1] / "engines" / engine / "run.py"
    return local if local.is_file() else WORLDS_DIR / "engines" / engine / "run.py"


def list_worlds() -> List[str]:
    ids = {p.stem for root in _roots() if (root / "cases").is_dir() for p in (root / "cases").glob("*.json")}
    return sorted(i for i in ids if _WORLD_ID.match(i))


def describe_world(world: str) -> Dict[str, Any]:
    path = _case_path(world)
    if path:
        body = json.loads(path.read_text(encoding="utf-8"))["describe"]
        return {**_envelope("describe_world", "live"), "status": "ok", "world": world, **body, "error": None}
    if config.mode() == "fake":
        return _fake("describe_world.json")
    return {**_envelope("describe_world", config.mode()), "status": "error", "world": world,
            "error": f"Unknown world {world!r}. Known: {list_worlds()}"}


def run_experiment(world: str, variant: str, params: Optional[Dict[str, Any]] = None,
                   timeout_s: float = 60) -> Dict[str, Any]:
    params = params or {}
    base = {**_envelope("run_experiment", "live"), "experiment_id": "x-" + uuid.uuid4().hex[:16],
            "world": world, "variant": variant, "params": params}
    if variant not in VARIANTS:
        return {**base, "status": "error", "passed": None, "error": f"variant must be one of {VARIANTS}"}
    path = _case_path(world)
    if not path:
        if config.mode() == "fake":
            return _fake(f"run_experiment_{'candidate' if variant == 'candidate' else 'baseline'}.json")
        return {**base, "status": "error", "passed": None, "error": f"Unknown world {world!r}. Known: {list_worlds()}"}

    engine = json.loads(path.read_text(encoding="utf-8"))["engine"]
    command = [sys.executable, "-I", str(_engine_path(path, engine)),
               "--case", str(path), "--variant", variant, "--params", json.dumps(params, sort_keys=True)]
    started = time.monotonic()
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=timeout_s)
    except subprocess.TimeoutExpired:
        return {**base, "status": "timeout", "passed": None, "duration_ms": int(timeout_s * 1000),
                "error": f"World did not finish within {timeout_s}s"}
    duration_ms = int((time.monotonic() - started) * 1000)
    try:
        body = json.loads(proc.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError):
        return {**base, "status": "error", "passed": None, "duration_ms": duration_ms,
                "error": "World printed no JSON result.", "logs": (proc.stderr or "").splitlines()[-20:]}
    if body.get("error"):
        return {**base, "status": "error", "passed": None, "duration_ms": duration_ms, "error": body["error"]}
    reproduce = {"command": f"python3 -m data_layer run {world} {variant}"
                            + (f" --params '{json.dumps(params, sort_keys=True)}'" if params else ""),
                 "input_sha256": body.pop("input_sha256", None)}
    return {**base, "status": "ok", "passed": bool(body.get("passed")),
            "assertions": body.get("assertions", []), "metrics": body.get("metrics", {}),
            "artifacts": body.get("artifacts", []), "logs": body.get("logs", []),
            "reproduce": reproduce, "duration_ms": duration_ms, "error": None}
