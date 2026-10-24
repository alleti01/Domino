"""Append-only evidence log: one JSON line per Zetaris query (SQL, returned row IDs, timing, outcome)."""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List

from . import config


def log_path() -> Path:
    return config.repo_path(config.get("DOMINO_QUERY_LOG", "runs/query_log.jsonl") or "runs/query_log.jsonl")


def new_query_id() -> str:
    return "q-" + uuid.uuid4().hex[:16]


def row_ids(rows: Iterable[Dict[str, Any]]) -> List[str]:
    """`source_system:source_row_id` for each row, or a content hash when a row has no source ID.

    When a query selects source_row_id but not source_system, the system is worked out from the row-ID
    prefix (e.g. jd-0005 -> pipeline_repo), so citations never read "unknown".
    """
    from .sources import source_for_row_id

    ids = []
    for row in rows:
        if row.get("source_row_id") not in (None, ""):
            system = row.get("source_system") or source_for_row_id(str(row["source_row_id"])) or "unknown"
            ids.append(f"{system}:{row['source_row_id']}")
        else:
            digest = hashlib.sha256(json.dumps(row, sort_keys=True, default=str).encode()).hexdigest()
            ids.append("hash:" + digest[:16])
    return ids


def record(entry: Dict[str, Any]) -> None:
    """Never let logging break a query; a failed write is reported on stderr only."""
    entry = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **entry}
    path = log_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, default=str) + "\n")
    except OSError as error:
        import sys

        print(f"query log write failed ({path}): {error}", file=sys.stderr)
