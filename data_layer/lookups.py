"""Agent-facing lookups over the Zetaris USL: `lookup` and `dependency_path`, in fake, sample or live mode."""

from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

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
    base = {**_envelope("dependency_path", mode), "start": {"entity_id": entity_id}, "paths": [],
            "unresolved": [], "query_ids": []}
    if not _ENTITY_ID.match(entity_id):
        return {**base, "status": "error", "error": "entity_id must look like <system>/<kind>/<name>."}
    system_id = entity_id.split("/", 1)[0]
    # The joins already happened in Zetaris (the dependency_edge activation); this only walks the result.
    sql = (f"SELECT from_id, from_type, to_id, to_type, relation, edge_status, evidence, detail "
           f"FROM {USL}.dependency_edge WHERE system_id = '{system_id}'")
    try:
        res = _client().run(sql, timeout_s=timeout_s, purpose="dependency_path")
    except ZetarisError as error:
        return {**base, "status": error.status, "error": str(error)}
    result = {**base, "status": "ok", "query_ids": [res.query_id], "duration_ms": res.duration_ms, "error": None,
              **_walk(entity_id, res.rows, res.query_id, max_hops)}
    _save_snapshot("dependency_path", request, result)
    return result


_ENTITY_ID = re.compile(r"^[a-z0-9-]{1,40}/[a-z_]{1,20}/[A-Za-z0-9_.#?-]{1,200}$")
USL = "lightning.metastore.domino.systems"


def _evidence(text: str, query_id: str) -> List[Dict[str, str]]:
    items = []
    for part in (text or "").split(";"):
        if ":" in part:
            system, row = part.split(":", 1)
            items.append({"source_system": system, "source_row_id": row, "query_id": query_id})
    return items


def _walk(start: str, edges: List[Dict[str, Any]], query_id: str, max_hops: int) -> Dict[str, Any]:
    """Every downstream path from `start`, up to max_hops, without revisiting a node on the same path."""
    outgoing: Dict[str, List[Dict[str, Any]]] = {}
    start_type = None
    for e in sorted(edges, key=lambda e: (e["from_id"], e["relation"], e["to_id"])):
        outgoing.setdefault(e["from_id"], []).append(e)
        if e["from_id"] == start:
            start_type = e["from_type"]

    def hop(e: Dict[str, Any]) -> Dict[str, Any]:
        return {"from": e["from_id"], "from_type": e["from_type"], "to": e["to_id"], "to_type": e["to_type"],
                "relation": e["relation"], "edge_status": e["edge_status"], "detail": e["detail"],
                "evidence": _evidence(e["evidence"], query_id)}

    paths, unresolved, seen_unresolved = [], [], set()

    def extend(node: str, trail: List[Dict[str, Any]], visited: set) -> None:
        nexts = [e for e in outgoing.get(node, []) if e["to_id"] not in visited] if len(trail) < max_hops else []
        if not nexts and trail:
            sources = {ev["source_system"] for h in trail for ev in h["evidence"]}
            paths.append({"hops": trail, "source_systems": sorted(sources), "meets_two_source_rule": len(sources) >= 2})
        for e in nexts:
            if e["edge_status"] == "unresolved" and e["to_id"] not in seen_unresolved:
                seen_unresolved.add(e["to_id"])
                unresolved.append({"from": e["from_id"], "to": e["to_id"], "relation": e["relation"],
                                   "reason": "referenced entity not found in any other source",
                                   "evidence": _evidence(e["evidence"], query_id)})
            extend(e["to_id"], trail + [hop(e)], visited | {e["to_id"]})

    extend(start, [], {start})
    return {"start": {"entity_id": start, "entity_type": start_type}, "paths": paths, "unresolved": unresolved,
            "edges_considered": len(edges)}
