"""Agent-facing lookups over the Zetaris USL: `lookup` and `dependency_path`, in fake, sample or live mode."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional

from . import config, query_log
from .zetaris_client import ZetarisClient, ZetarisError

CONTRACT_VERSION = "0.1"
SAMPLES_DIR = config.REPO_ROOT / "contracts" / "samples"
SNAPSHOT_DIR = config.REPO_ROOT / "zetaris" / "snapshots"

_agent: Optional[ZetarisClient] = None


def _envelope(call: str, mode: str) -> Dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "call": call, "mode": mode}


def _fake(name: str) -> Dict[str, Any]:
    return copy.deepcopy(json.loads((SAMPLES_DIR / name).read_text(encoding="utf-8")))


def _snapshot_path(call: str, request: Dict[str, Any]) -> Path:
    key = hashlib.sha256(json.dumps({"call": call, **request}, sort_keys=True).encode()).hexdigest()[:20]
    return SNAPSHOT_DIR / call / f"{key}.json"


def _load_snapshot(call: str, request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    path = _snapshot_path(call, request)
    if not path.is_file():
        return None
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    snapshot["mode"] = "sample"
    return snapshot


def _save_snapshot(call: str, request: Dict[str, Any], result: Dict[str, Any]) -> None:
    if config.get("DOMINO_SNAPSHOT_WRITE") != "1" or result.get("status") != "ok":
        return
    path = _snapshot_path(call, request)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({**result, "snapshot_request": request}, indent=2, default=str) + "\n", encoding="utf-8")


def _client() -> ZetarisClient:
    global _agent
    if _agent is None:
        _agent = ZetarisClient("agent")
    return _agent


def _not_in_sample(call: str, request: Dict[str, Any]) -> Dict[str, Any]:
    return {**_envelope(call, "sample"), "status": "not_in_sample",
            "error": f"No saved snapshot for this {call} request; sample mode only replays recorded queries.",
            "request": request}


def lookup(sql: str, limit: Optional[int] = None, timeout_s: float = 30) -> Dict[str, Any]:
    """Run one read-only SQL statement against the USL; rows keep their source_system / source_row_id."""
    mode = config.mode()
    if mode == "fake":
        result = _fake("lookup.json")
        result["sql_requested"] = sql
        return result
    request = {"sql": " ".join(sql.split()).rstrip(";").strip(), "limit": limit}
    if mode == "sample":
        return _load_snapshot("lookup", request) or _not_in_sample("lookup", request)
    try:
        res = _client().run(sql, limit=limit, timeout_s=timeout_s, purpose="lookup")
    except ZetarisError as error:
        return {**_envelope("lookup", mode), "status": error.status, "sql": sql, "error": str(error),
                "columns": [], "rows": [], "row_count": 0, "row_ids": []}
    result = {**_envelope("lookup", mode), "status": "ok", "query_id": res.query_id, "sql": res.sql,
              "columns": res.columns, "rows": res.rows, "row_count": len(res.rows),
              "row_ids": query_log.row_ids(res.rows), "truncated": res.truncated,
              "duration_ms": res.duration_ms, "error": None}
    _save_snapshot("lookup", request, result)
    return result


def dependency_path(entity_id: str, max_hops: int = 6, timeout_s: float = 60) -> Dict[str, Any]:
    """Downstream chain from a changed entity, joined in the Zetaris USL, with per-edge evidence."""
    mode = config.mode()
    if mode == "fake":
        result = _fake("dependency_path.json")
        result["entity_requested"] = entity_id
        return result
    request = {"entity_id": entity_id, "max_hops": max_hops}
    if mode == "sample":
        return _load_snapshot("dependency_path", request) or _not_in_sample("dependency_path", request)
    # Live path traversal is built in Phase 2, once the USL relationship tables exist.
    return {**_envelope("dependency_path", mode), "status": "error", "start": {"entity_id": entity_id},
            "paths": [], "unresolved": [], "query_ids": [],
            "error": "dependency_path is not available live until the USL is compiled (Phase 2)."}
