"""Metadata store: a SQLite catalog of table columns across databases, plus per-principal read grants.

Grants use a small SQL dialect, one statement per line:
    GRANT SELECT ON <db>.* TO <principal>;
    REVOKE SELECT ON <db>.* FROM <principal>;
A principal querying `system_columns` sees only rows from databases it has been granted.
"""

from __future__ import annotations

import re
import sqlite3
from typing import List

_NAME = r"[a-z][a-z0-9_]*"
_STATEMENT = re.compile(rf"^(GRANT|REVOKE)\s+SELECT\s+ON\s+({_NAME})\.\*\s+(?:TO|FROM)\s+({_NAME})\s*;?$", re.IGNORECASE)


def init(db_path: str, databases: List[str], table: str, n_columns: int, types: List[str]) -> None:
    conn = sqlite3.connect(db_path)
    conn.executescript(
        "CREATE TABLE all_columns (db TEXT NOT NULL, tbl TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL);"
        "CREATE TABLE grants (principal TEXT NOT NULL, db TEXT NOT NULL, PRIMARY KEY (principal, db));"
    )
    rows = [(db, table, f"f_{i:03d}", types[i % len(types)]) for db in databases for i in range(n_columns)]
    conn.executemany("INSERT INTO all_columns VALUES (?, ?, ?, ?)", rows)
    conn.commit()
    conn.close()


def apply_migration(db_path: str, sql_text: str) -> List[str]:
    """Apply GRANT/REVOKE lines; anything else is rejected so a migration can't do something unexpected."""
    conn = sqlite3.connect(db_path)
    applied = []
    for raw in sql_text.splitlines():
        line = raw.strip()
        if not line or line.startswith("--"):
            continue
        match = _STATEMENT.match(line)
        if not match:
            conn.close()
            raise ValueError(f"unsupported statement: {line}")
        verb, db, principal = match.group(1).upper(), match.group(2), match.group(3)
        if verb == "GRANT":
            conn.execute("INSERT OR IGNORE INTO grants VALUES (?, ?)", (principal, db))
        else:
            conn.execute("DELETE FROM grants WHERE principal = ? AND db = ?", (principal, db))
        applied.append(line)
    conn.commit()
    conn.close()
    return applied


def connect_as(db_path: str, principal: str) -> sqlite3.Connection:
    """Read-only connection where `system_columns` is filtered to the principal's granted databases."""
    if not re.fullmatch(_NAME, principal):
        raise ValueError(f"invalid principal: {principal!r}")
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.execute(
        "CREATE TEMP VIEW system_columns AS SELECT db, tbl, name, type FROM all_columns "
        f"WHERE db IN (SELECT db FROM grants WHERE principal = '{principal}')"
    )
    return conn
