"""Practice versions of the data-layer calls, with the same signatures and result shapes (contract v0.3).

    from practice import describe_world, dependency_path, list_tables, lookup, run_experiment, list_worlds

Results carry mode="practice". Everything runs in memory: no Zetaris, no network, no keys.
lookup() runs read-only SQL over these tables (every value is a string, as in Zetaris):
    config_repo, telemetry, code_index, db_catalog, schema_registry
        system_id, subject, key, value, source_system, source_row_id
    dependency_edge
        system_id, edge_id, from_id, from_type, to_id, to_type, relation, edge_status, evidence, detail
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from .scenarios import SCENARIOS, SOURCES
from .sims import SIMS

CONTRACT_VERSION = "0.3"
MODE = "practice"
VARIANTS = ("baseline", "candidate", "control")
READ_ONLY = ("select", "with")
_ENTITY_ID = re.compile(r"^[a-z0-9-]{1,40}/[a-z_]{1,20}/[A-Za-z0-9_.#?-]{1,200}$")
_BY_ID = {s["id"]: s for s in SCENARIOS}

FIELDS = {
    "lookup": {"query_id": None, "sql": None, "columns": [], "rows": [], "row_count": 0, "row_ids": [],
               "truncated": False, "duration_ms": None, "error": None},
    "dependency_path": {"start": {"entity_id": None, "entity_type": None}, "direction": "downstream", "paths": [], "unresolved": [],
                        "dq_issues": [], "edges_considered": 0, "query_ids": [], "duration_ms": None, "error": None},
    "list_tables": {"system_column": None, "tables": [], "error": None},
    "run_experiment": {"passed": None, "assertions": [], "metrics": {}, "artifacts": [], "logs": [], "reproduce": None,
                       "duration_ms": None, "error": None},
    "describe_world": {"title": None, "components": [], "change": None, "variants": {}, "params": {}, "metrics": [],
                       "error": None},
}


def _result(call: str, status: str, **fields: Any) -> Dict[str, Any]:
    return {"contract_version": CONTRACT_VERSION, "call": call, "mode": MODE, "status": status,
            **copy.deepcopy(FIELDS[call]), **fields}


def _fact_rows() -> Dict[str, List[Dict[str, str]]]:
    tables: Dict[str, List[Dict[str, str]]] = {name: [] for name in SOURCES}
    for s in SCENARIOS:
        for source, subject, key, value in s["facts"]:
            rows = tables[source]
            rows.append({"system_id": s["id"], "subject": subject, "key": key, "value": value,
                         "source_system": SOURCES[source], "source_row_id": f"{source[:3]}-{len(rows) + 1:04d}"})
    return tables


FACTS = _fact_rows()


def _edge_rows() -> List[Dict[str, str]]:
    edges = []
    for s in SCENARIOS:
        mine = {name: [r for r in rows if r["system_id"] == s["id"]] for name, rows in FACTS.items()}
        by_fact = []  # the scenario's fact index -> its row, in declaration order
        counters: Dict[str, int] = {}
        for source, *_rest in s["facts"]:
            counters[source] = counters.get(source, 0) + 1
            by_fact.append(mine[source][counters[source] - 1])
        for n, (src, rel, dst, status, refs, detail) in enumerate(s["edges"], start=1):
            evidence = ";".join(f"{by_fact[i]['source_system']}:{by_fact[i]['source_row_id']}" for i in refs)
            edges.append({"system_id": s["id"], "edge_id": f"{s['id']}/edge/{n}",
                          "from_id": f"{s['id']}/{src}", "from_type": src.split("/")[0],
                          "to_id": f"{s['id']}/{dst}", "to_type": dst.split("/")[0], "relation": rel,
                          "edge_status": status, "evidence": evidence, "detail": detail})
    return edges


EDGES = _edge_rows()


def list_worlds() -> List[str]:
    return sorted(_BY_ID)


def describe_world(world: str) -> Dict[str, Any]:
    s = _BY_ID.get(world) if isinstance(world, str) else None
    if not s:
        return _result("describe_world", "error", world=world if isinstance(world, str) else None,
                       error=f"Unknown world {world!r}. Known: {list_worlds()}")
    ch = s["change"]
    metrics = sorted(SIMS[s["sim"]["type"]](s["sim"], s["sim"]["before"])[0])
    return _result("describe_world", "ok", world=world, title=s["title"], components=s["components"],
                   change={"entity_id": f"{world}/change/{ch['change_id']}", "title": ch["title"],
                           "description": ch["description"], "files": ch["files"], "diff": ch["diff"]},
                   variants={"baseline": "system without the change", "candidate": "system with the change applied",
                             "control": "change applied, then reverted"},
                   params={}, metrics=metrics)


def lookup(sql: str, limit: Optional[int] = None, timeout_s: float = 30) -> Dict[str, Any]:
    started, qid = time.monotonic(), "q-" + uuid.uuid4().hex[:16]
    if not isinstance(sql, str) or not sql.strip():
        return _result("lookup", "error", error="sql must be a non-empty string")
    text = sql.strip().rstrip(";").strip()
    if text.split(None, 1)[0].lower() not in READ_ONLY or ";" in text:
        return _result("lookup", "error", sql=sql, query_id=qid,
                       error="Refused: read-only access allows one SELECT or WITH statement.")
    if limit is not None and (isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 10000):
        return _result("lookup", "error", sql=sql, error=f"limit must be an integer between 1 and 10000, got {limit!r}")
    conn = sqlite3.connect(":memory:")
    try:
        for name, rows in FACTS.items():
            conn.execute(f"CREATE TABLE {name} (system_id TEXT, subject TEXT, key TEXT, value TEXT, "
                         "source_system TEXT, source_row_id TEXT)")
            conn.executemany(f"INSERT INTO {name} VALUES (:system_id, :subject, :key, :value, :source_system, "
                             ":source_row_id)", rows)
        conn.execute("CREATE TABLE dependency_edge (system_id TEXT, edge_id TEXT, from_id TEXT, from_type TEXT, "
                     "to_id TEXT, to_type TEXT, relation TEXT, edge_status TEXT, evidence TEXT, detail TEXT)")
        conn.executemany("INSERT INTO dependency_edge VALUES (:system_id, :edge_id, :from_id, :from_type, :to_id, "
                         ":to_type, :relation, :edge_status, :evidence, :detail)", EDGES)
        cur = conn.execute(text)
        columns = [d[0] for d in cur.description or []]
        cap = limit or 1000
        raw = cur.fetchmany(cap + 1)
    except sqlite3.Error as error:
        return _result("lookup", "error", sql=sql, query_id=qid, error=f"SQL error: {error}",
                       duration_ms=int((time.monotonic() - started) * 1000))
    finally:
        conn.close()
    rows = [{c: (None if v is None else str(v)) for c, v in zip(columns, r)} for r in raw[:cap]]
    row_ids = [f"{r.get('source_system') or _source_for(r['source_row_id'])}:{r['source_row_id']}" if r.get("source_row_id")
               else "hash:" + hashlib.sha256(json.dumps(r, sort_keys=True).encode()).hexdigest()[:16] for r in rows]
    return _result("lookup", "ok", query_id=qid, sql=text, columns=columns, rows=rows, row_count=len(rows),
                   row_ids=row_ids, truncated=len(raw) > cap, duration_ms=int((time.monotonic() - started) * 1000))


def _source_for(row_id: str) -> str:
    """'con-0004' -> 'config_repo' (same rule as the real data layer: the row-ID prefix names the source)."""
    prefix = row_id.split("-", 1)[0]
    return next((src for name, src in SOURCES.items() if name[:3] == prefix), "unknown")


TABLE_INFO = {
    "config_repo": "configuration files: settings per component",
    "telemetry": "observed metrics per component",
    "code_index": "facts read from the code of each component",
    "db_catalog": "database facts: keys, limits, sizes",
    "schema_registry": "event and message schemas",
}


def list_tables() -> Dict[str, Any]:
    """Tables lookup() may query, with columns and source systems (same shape as the real list_tables)."""
    fact_columns = ["system_id", "subject", "key", "value", "source_system", "source_row_id"]
    edge_columns = ["system_id", "edge_id", "from_id", "from_type", "to_id", "to_type", "relation", "edge_status",
                    "evidence", "detail"]
    tables = [{"name": name, "short_name": name, "description": TABLE_INFO[name], "source_systems": [SOURCES[name]],
               "columns": [{"name": c, "type": "varchar"} for c in fact_columns]} for name in SOURCES]
    tables.append({"name": "dependency_edge", "short_name": "dependency_edge",
                   "description": "cross-source links with status and evidence rows",
                   "source_systems": sorted(set(SOURCES.values())),
                   "columns": [{"name": c, "type": "varchar"} for c in edge_columns]})
    return _result("list_tables", "ok", system_column="system_id", tables=tables)


def _evidence(text: str, query_id: str) -> List[Dict[str, str]]:
    return [{"source_system": p.split(":", 1)[0], "source_row_id": p.split(":", 1)[1], "query_id": query_id}
            for p in (text or "").split(";") if ":" in p]


def dependency_path(entity_id: str, max_hops: int = 6, timeout_s: float = 60,
                    direction: str = "downstream") -> Dict[str, Any]:
    started, qid = time.monotonic(), "q-" + uuid.uuid4().hex[:16]
    start = {"entity_id": entity_id if isinstance(entity_id, str) else None, "entity_type": None}
    if not isinstance(entity_id, str) or not _ENTITY_ID.match(entity_id):
        return _result("dependency_path", "error", start=start,
                       error=f"entity_id must look like <system>/<kind>/<name>; got {entity_id!r}")
    if direction not in ("downstream", "upstream"):
        return _result("dependency_path", "error", start=start, direction=direction,
                       error=f"direction must be one of ('downstream', 'upstream'), got {direction!r}")
    if isinstance(max_hops, bool) or not isinstance(max_hops, int) or not 1 <= max_hops <= 12:
        return _result("dependency_path", "error", start=start, error=f"max_hops must be 1-12, got {max_hops!r}")
    system = entity_id.split("/", 1)[0]
    edges = [e for e in EDGES if e["system_id"] == system]
    near, far = ("from_id", "to_id") if direction == "downstream" else ("to_id", "from_id")
    outgoing: Dict[str, List[Dict[str, str]]] = {}
    for e in edges:
        outgoing.setdefault(e[near], []).append(e)
        if e[near] == entity_id:
            start["entity_type"] = e[near.replace("_id", "_type")]
    if start["entity_type"] is None:
        return _result("dependency_path", "error", start=start, direction=direction, query_ids=[qid],
                       edges_considered=len(edges),
                       error=f"No edges {'start' if direction == 'downstream' else 'end'} at {entity_id!r} "
                             f"({len(edges)} edges for that system). "
                             "Check the id: describe_world(world)['change']['entity_id'].")
    paths, unresolved = [], []

    def hop(e):
        return {"from": e["from_id"], "from_type": e["from_type"], "to": e["to_id"], "to_type": e["to_type"],
                "relation": e["relation"], "edge_status": e["edge_status"], "detail": e["detail"],
                "evidence": _evidence(e["evidence"], qid)}

    def extend(node, trail, visited):
        nexts = [e for e in outgoing.get(node, []) if e[far] not in visited] if len(trail) < max_hops else []
        if not nexts and trail:
            sources = sorted({ev["source_system"] for h in trail for ev in h["evidence"]})
            paths.append({"hops": trail, "source_systems": sources, "meets_two_source_rule": len(sources) >= 2})
        for e in nexts:
            if e["edge_status"] == "unresolved":
                unresolved.append({"from": e["from_id"], "to": e["to_id"], "relation": e["relation"],
                                   "reason": "referenced entity not found in any other source",
                                   "evidence": _evidence(e["evidence"], qid)})
            extend(e[far], trail + [hop(e)], visited | {e[far]})

    extend(entity_id, [], {entity_id})
    return _result("dependency_path", "ok", start=start, direction=direction, paths=paths, unresolved=unresolved,
                   edges_considered=len(edges), query_ids=[qid], duration_ms=int((time.monotonic() - started) * 1000))


def run_experiment(world: str, variant: str, params: Optional[Dict[str, Any]] = None,
                   timeout_s: float = 60) -> Dict[str, Any]:
    started = time.monotonic()
    params = {} if params is None else params
    base = {"experiment_id": "x-" + uuid.uuid4().hex[:16], "world": world if isinstance(world, str) else None,
            "variant": variant, "params": params if isinstance(params, dict) else None}
    s = _BY_ID.get(world) if isinstance(world, str) else None
    if not s:
        return _result("run_experiment", "error", **base, error=f"Unknown world {world!r}. Known: {list_worlds()}")
    if variant not in VARIANTS:
        return _result("run_experiment", "error", **base, error=f"variant must be one of {VARIANTS}, got {variant!r}")
    if not isinstance(params, dict) or params:
        return _result("run_experiment", "error", **base, error="these worlds accept no params; pass {} or omit it")
    settings = s["sim"]["after"] if variant == "candidate" else s["sim"]["before"]
    metrics, assertions, logs = SIMS[s["sim"]["type"]](s["sim"], settings)
    # Same as the real data layer: observed / expected are always text.
    assertions = [{**a, "observed": str(a["observed"]), "expected": str(a["expected"])} for a in assertions]
    state = json.dumps({"metrics": metrics, "settings": settings}, sort_keys=True).encode()
    return _result("run_experiment", "ok", **base, passed=all(a["passed"] for a in assertions), assertions=assertions,
                   metrics=metrics, logs=logs,
                   artifacts=[{"name": "state.json", "sha256": hashlib.sha256(state).hexdigest(), "bytes": len(state)}],
                   reproduce={"command": f"python3 -m practice run {world} {variant}",
                              "input_sha256": hashlib.sha256(json.dumps([world, variant]).encode()).hexdigest()},
                   duration_ms=int((time.monotonic() - started) * 1000))
