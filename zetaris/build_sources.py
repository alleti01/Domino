"""Generates the synthetic Zetaris source files (CSV) from the world case files.

Each world case is one "system". Its facts are split across independent sources so that no single
file holds the whole chain from a change to its downstream effect:

  change_records.csv    change_records   statements in the proposed change (the PR)
  access_grants.csv     db_catalog       current read grants per principal and database
  table_inventory.csv   db_catalog       tables per database with their column counts
  job_definitions.csv   pipeline_repo    services: identity they run as, query, output file
  runtime_config.csv    runtime_config   services: input file and settings
  query_telemetry.csv   telemetry        observed query results over recent runs

Every row carries `source_system` and `source_row_id`. All data is synthetic.

    python3 zetaris/build_sources.py
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES_DIR = ROOT / "worlds" / "cases"
OUT_DIR = Path(__file__).resolve().parent / "sources"

TABLES = {
    "change_records": ["source_system", "source_row_id", "system_id", "change_id", "file_path", "statement_seq",
                       "action", "privilege", "principal_name", "database_name", "title"],
    "access_grants": ["source_system", "source_row_id", "system_id", "principal_name", "database_name", "privilege"],
    "table_inventory": ["source_system", "source_row_id", "system_id", "database_name", "table_name", "column_count"],
    "job_definitions": ["source_system", "source_row_id", "system_id", "service_name", "runs_as_principal", "query_id",
                        "query_text", "reads_table", "output_artifact", "output_mode"],
    "runtime_config": ["source_system", "source_row_id", "system_id", "service_name", "input_artifact", "setting_key",
                       "setting_value"],
    "query_telemetry": ["source_system", "source_row_id", "system_id", "query_id", "service_name", "principal_name",
                        "window_days", "sampled_runs", "rows_returned_p50", "artifact_entries_p50"],
}
SOURCE_SYSTEM = {"change_records": "change_records", "access_grants": "db_catalog", "table_inventory": "db_catalog",
                 "job_definitions": "pipeline_repo", "runtime_config": "runtime_config", "query_telemetry": "telemetry"}
PREFIX = {"change_records": "cr", "access_grants": "ag", "table_inventory": "ti", "job_definitions": "jd",
          "runtime_config": "rc", "query_telemetry": "qt"}
_GRANT = re.compile(r"^(GRANT|REVOKE)\s+(SELECT)\s+ON\s+([a-z0-9_]+)\.\*\s+(?:TO|FROM)\s+([a-z0-9_]+);?$", re.IGNORECASE)


def _statements(sql: str):
    for line in sql.splitlines():
        match = _GRANT.match(line.strip())
        if match:
            yield match.group(1).upper(), match.group(2).upper(), match.group(3), match.group(4)


def facts_for_case(case_id: str, case: dict) -> dict:
    """Rows for one system, before source_system / source_row_id are assigned."""
    setup, change = case["setup"], case["describe"]["change"]
    principal, table = setup["principal"], setup["table"]
    rows = {name: [] for name in TABLES}

    for seq, (action, privilege, db, who) in enumerate(_statements(setup["change_sql"]), start=1):
        rows["change_records"].append({"change_id": "0042", "file_path": change["files"][0], "statement_seq": seq,
                                       "action": action, "privilege": privilege, "principal_name": who,
                                       "database_name": db, "title": change["title"]})

    for _action, privilege, db, who in _statements(setup["base_sql"]):
        rows["access_grants"].append({"principal_name": who, "database_name": db, "privilege": privilege})
    # Other principals in the same catalog, so the reader is one identity among several.
    for who, dbs in (("svc_admin_console", setup["databases"]), ("svc_metrics", ["default"])):
        for db in dbs:
            rows["access_grants"].append({"principal_name": who, "database_name": db, "privilege": "SELECT"})

    for db in setup["databases"]:
        rows["table_inventory"].append({"database_name": db, "table_name": table, "column_count": setup["n_columns"]})
    for other, count in (("request_log", 12), ("user_profile", 8)):
        rows["table_inventory"].append({"database_name": "default", "table_name": other, "column_count": count})

    rows["job_definitions"].append({
        "service_name": "bundle-builder", "runs_as_principal": principal, "query_id": "q-bundle-fields",
        "query_text": f"SELECT name, type FROM system.columns WHERE table = '{table}' ORDER BY name",
        "reads_table": table, "output_artifact": "bundle.json",
        "output_mode": "collapse_same_name" if setup["builder"].get("collapse_same_name") else "as_returned"})
    rows["job_definitions"].append({
        "service_name": "metrics-exporter", "runs_as_principal": "svc_metrics", "query_id": "q-request-log",
        "query_text": "SELECT status, count(*) FROM default.request_log GROUP BY status",
        "reads_table": "request_log", "output_artifact": "request_metrics.csv", "output_mode": "as_returned"})

    for key, value in (("max_entries", setup["runtime"]["max_entries"]), ("startup_timeout_s", 30)):
        rows["runtime_config"].append({"service_name": "worker-runtime", "input_artifact": "bundle.json",
                                       "setting_key": key, "setting_value": value})
    rows["runtime_config"].append({"service_name": "status-dashboard", "input_artifact": "request_metrics.csv",
                                   "setting_key": "refresh_s", "setting_value": 60})

    # Before the change the reader sees only `default`, so telemetry shows one copy of each column.
    rows["query_telemetry"].append({"query_id": "q-bundle-fields", "service_name": "bundle-builder",
                                    "principal_name": principal, "window_days": 7, "sampled_runs": 288,
                                    "rows_returned_p50": setup["n_columns"], "artifact_entries_p50": setup["n_columns"]})
    rows["query_telemetry"].append({"query_id": "q-request-log", "service_name": "metrics-exporter",
                                    "principal_name": "svc_metrics", "window_days": 7, "sampled_runs": 2016,
                                    "rows_returned_p50": 5, "artifact_entries_p50": 5})
    for name in rows:
        for row in rows[name]:
            row["system_id"] = case_id
    return rows


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tables = {name: [] for name in TABLES}
    for path in sorted(CASES_DIR.glob("*.json")):
        case = json.loads(path.read_text(encoding="utf-8"))
        if case.get("engine") != "e1":
            continue
        for name, rows in facts_for_case(path.stem, case).items():
            tables[name].extend(rows)
    for name, rows in tables.items():
        with (OUT_DIR / f"{name}.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=TABLES[name], lineterminator="\n")
            writer.writeheader()
            for i, row in enumerate(rows, start=1):
                writer.writerow({"source_system": SOURCE_SYSTEM[name], "source_row_id": f"{PREFIX[name]}-{i:04d}", **row})
        print(f"{name}.csv: {len(rows)} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
