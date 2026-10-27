"""tenant-registry: a SQLite registry of tenant records. Sites own app records.

Record IDs share one format whatever their kind, so an ID alone does not say what it points at.
"""

from __future__ import annotations

import hashlib
import sqlite3
from typing import Dict, List


def record_id(case_id: str, kind: str, index: int) -> str:
    return "r-" + hashlib.sha256(f"{case_id}|{kind}|{index}".encode()).hexdigest()[:10]


def layout(case_id: str, n_sites: int, app_kinds: List[str]) -> List[Dict[str, str]]:
    """Deterministic records: every site gets one app of each kind."""
    rows = []
    for s in range(n_sites):
        site = record_id(case_id, "site", s)
        owner = f"customer-{s + 1:03d}"
        rows.append({"record_id": site, "kind": "site", "parent_id": "", "owner": owner, "status": "active"})
        for a, app_kind in enumerate(app_kinds):
            rows.append({"record_id": record_id(case_id, f"app:{app_kind}", s), "kind": f"app:{app_kind}",
                         "parent_id": site, "owner": owner, "status": "active"})
    return rows


def init(db_path: str, rows: List[Dict[str, str]]) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE records (record_id TEXT PRIMARY KEY, kind TEXT NOT NULL, parent_id TEXT, "
                 "owner TEXT NOT NULL, status TEXT NOT NULL)")
    conn.executemany("INSERT INTO records VALUES (:record_id, :kind, :parent_id, :owner, :status)", rows)
    conn.commit()
    conn.close()


def snapshot(db_path: str) -> Dict[str, Dict[str, str]]:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT record_id, kind, parent_id, owner, status FROM records ORDER BY record_id").fetchall()
    conn.close()
    return {r[0]: {"kind": r[1], "parent_id": r[2], "owner": r[3], "status": r[4]} for r in rows}
