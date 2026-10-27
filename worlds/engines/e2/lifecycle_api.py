"""lifecycle-api: removes a registry record by ID.

Accepts any record ID. Removing a site also removes every record whose parent is that site.
"""

from __future__ import annotations

import sqlite3


def delete_record(conn: sqlite3.Connection, record_id: str, mode: str) -> dict:
    row = conn.execute("SELECT kind FROM records WHERE record_id = ?", (record_id,)).fetchone()
    if row is None:
        return {"record_id": record_id, "result": "not_found", "removed": []}
    children = [r[0] for r in conn.execute("SELECT record_id FROM records WHERE parent_id = ?", (record_id,))]
    removed = [record_id] + children
    if mode == "permanent":
        conn.executemany("DELETE FROM records WHERE record_id = ?", [(r,) for r in removed])
    else:
        conn.executemany("UPDATE records SET status = 'marked_for_removal' WHERE record_id = ?", [(r,) for r in removed])
    return {"record_id": record_id, "result": "removed", "kind": row[0], "removed": removed}
