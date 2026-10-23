"""Uniform experiment interface: each world runs as a disposable subprocess with a hard timeout.

A world lives in `worlds/<world_id>/` with:
  describe.json  neutral description: components, the change under review, params, metrics (no hints)
  world.py       `python3 world.py --variant V --params JSON` prints one JSON object:
                 {passed, assertions, metrics, artifacts, logs, input_sha256}
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import uuid
from typing import Any, Dict, List, Optional

from . import config
from .lookups import CONTRACT_VERSION, _fake

WORLDS_DIR = config.REPO_ROOT / "worlds"
VARIANTS = ("baseline", "candidate", "control")
_WORLD_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,40}$")


def _envelope(call: str, mode: str) -> Dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "call": call, "mode": mode}


def list_worlds() -> List[str]:
    if not WORLDS_DIR.is_dir():
        return []
    return sorted(p.name for p in WORLDS_DIR.iterdir() if (p / "world.py").is_file() and _WORLD_ID.match(p.name))


def _real(world: str) -> bool:
    return bool(_WORLD_ID.match(world)) and (WORLDS_DIR / world / "world.py").is_file()


def describe_world(world: str) -> Dict[str, Any]:
    if _real(world):
        body = json.loads((WORLDS_DIR / world / "describe.json").read_text(encoding="utf-8"))
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
    if not _real(world):
        if config.mode() == "fake":
            return _fake(f"run_experiment_{'candidate' if variant == 'candidate' else 'baseline'}.json")
        return {**base, "status": "error", "passed": None, "error": f"Unknown world {world!r}. Known: {list_worlds()}"}

    command = [sys.executable, "-I", str(WORLDS_DIR / world / "world.py"),
               "--variant", variant, "--params", json.dumps(params, sort_keys=True)]
    started = time.monotonic()
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=timeout_s, cwd=str(WORLDS_DIR / world))
    except subprocess.TimeoutExpired:
        return {**base, "status": "timeout", "passed": None, "duration_ms": int(timeout_s * 1000),
                "error": f"World did not finish within {timeout_s}s"}
    duration_ms = int((time.monotonic() - started) * 1000)
    try:
        body = json.loads(proc.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError):
        return {**base, "status": "error", "passed": None, "duration_ms": duration_ms,
                "error": "World printed no JSON result.", "logs": (proc.stderr or "").splitlines()[-20:]}
    reproduce = {"command": f"python3 -m data_layer run {world} {variant}"
                            + (f" --params '{json.dumps(params, sort_keys=True)}'" if params else ""),
                 "input_sha256": body.pop("input_sha256", None)}
    return {**base, "status": "ok", "passed": bool(body.get("passed")),
            "assertions": body.get("assertions", []), "metrics": body.get("metrics", {}),
            "artifacts": body.get("artifacts", []), "logs": body.get("logs", []),
            "reproduce": reproduce, "duration_ms": duration_ms, "error": None}
