"""Writes the e1 case files into worlds/cases/. Re-run after editing CASES.

Only structural parameters live here. What each case is expected to do lives in ground_truth/.
"""

from __future__ import annotations

import json
from pathlib import Path

CASES_DIR = Path(__file__).resolve().parents[2] / "cases"
PRINCIPAL = "svc_bundle_reader"
TABLE = "bundle_fields"
TYPES = ["float", "text", "int"]

# case_id: shard databases the change grants, columns per database, runtime slots, builder option
CASES = {
    "w-k7m2": {"shards": ["r0"], "n_columns": 140, "max_entries": 200, "collapse": False},
    "w-p4r8": {"shards": ["r0"], "n_columns": 140, "max_entries": 200, "collapse": True},
    "w-t3n6": {"shards": ["r0"], "n_columns": 90, "max_entries": 150, "collapse": False},
    "w-h9c5": {"shards": ["r0"], "n_columns": 99, "max_entries": 200, "collapse": False},
    "w-d2v4": {"shards": ["r0", "r1"], "n_columns": 60, "max_entries": 160, "collapse": False},
}


def _diff(path: str, lines: list) -> str:
    body = "".join(f"+{line}\n" for line in lines)
    return f"--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{len(lines)} @@\n{body}"


def build(case_id: str, spec: dict) -> dict:
    grants = [f"GRANT SELECT ON {db}.* TO {PRINCIPAL};" for db in spec["shards"]]
    revokes = [f"REVOKE SELECT ON {db}.* FROM {PRINCIPAL};" for db in spec["shards"]]
    migration = ["-- Make the reader's access to shard databases explicit so per-principal",
                 "-- query limits and audit logging apply to it.", *grants]
    return {
        "engine": "e1",
        "describe": {
            "title": "Explicit shard grants for the bundle reader",
            "components": [
                {"name": "meta-store", "role": "catalog of table columns across databases, with per-principal grants"},
                {"name": "bundle-builder", "role": f"runs as {PRINCIPAL}; reads column metadata for {TABLE} and writes a bundle file"},
                {"name": "worker-runtime", "role": "loads the bundle file at startup"},
            ],
            "change": {
                "title": f"Explicit shard grants for {PRINCIPAL}",
                "description": "Moves the reader's implicit access to shard databases onto explicit grants "
                               "so that per-principal query limits and audit logging apply.",
                "files": ["db/migrations/0042_reader_shard_grants.sql"],
                "diff": _diff("db/migrations/0042_reader_shard_grants.sql", migration),
            },
            "variants": {
                "baseline": "system without the change",
                "candidate": "system with the change applied",
                "control": "change applied, then reverted",
            },
            "params": {},
            "metrics": ["meta-store.rows_visible_to_builder", "bundle-builder.entries",
                        "bundle-builder.bundle_bytes", "worker-runtime.exit_code", "worker-runtime.loaded_entries"],
        },
        "setup": {
            "databases": ["default", *spec["shards"]],
            "table": TABLE,
            "n_columns": spec["n_columns"],
            "types": TYPES,
            "principal": PRINCIPAL,
            "base_sql": f"GRANT SELECT ON default.* TO {PRINCIPAL};",
            "change_sql": "\n".join(migration),
            "revert_sql": "\n".join(revokes),
            "runtime": {"max_entries": spec["max_entries"]},
            "builder": {"collapse_same_name": spec["collapse"]},
        },
    }


if __name__ == "__main__":
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    for case_id, spec in CASES.items():
        (CASES_DIR / f"{case_id}.json").write_text(json.dumps(build(case_id, spec), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(CASES)} cases to {CASES_DIR}")
