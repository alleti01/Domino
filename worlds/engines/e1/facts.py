"""Zetaris facts for engine e1 cases: rows for each source table, before source IDs are assigned.

Called by zetaris/build_sources.py. Only structural case parameters are used, never labels.
"""

from __future__ import annotations

import re

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
    rows = {}

    for seq, (action, privilege, db, who) in enumerate(_statements(setup["change_sql"]), start=1):
        rows.setdefault("change_records", []).append({"change_id": "0042", "file_path": change["files"][0], "statement_seq": seq,
                                       "action": action, "privilege": privilege, "principal_name": who,
                                       "database_name": db, "title": change["title"]})

    for _action, privilege, db, who in _statements(setup["base_sql"]):
        rows.setdefault("access_grants", []).append({"principal_name": who, "database_name": db, "privilege": privilege})
    # Other principals in the same catalog, so the reader is one identity among several.
    for who, dbs in (("svc_admin_console", setup["databases"]), ("svc_metrics", ["default"])):
        for db in dbs:
            rows.setdefault("access_grants", []).append({"principal_name": who, "database_name": db, "privilege": "SELECT"})

    for db in setup["databases"]:
        rows.setdefault("table_inventory", []).append({"database_name": db, "table_name": table, "column_count": setup["n_columns"]})
    for other, count in (("request_log", 12), ("user_profile", 8)):
        rows.setdefault("table_inventory", []).append({"database_name": "default", "table_name": other, "column_count": count})

    rows.setdefault("job_definitions", []).append({
        "service_name": "bundle-builder", "runs_as_principal": principal, "query_id": "q-bundle-fields",
        "query_text": f"SELECT name, type FROM system.columns WHERE table = '{table}' ORDER BY name",
        "reads_table": table, "output_artifact": "bundle.json",
        "output_mode": "collapse_same_name" if setup["builder"].get("collapse_same_name") else "as_returned"})
    rows.setdefault("job_definitions", []).append({
        "service_name": "metrics-exporter", "runs_as_principal": "svc_metrics", "query_id": "q-request-log",
        "query_text": "SELECT status, count(*) FROM default.request_log GROUP BY status",
        "reads_table": "request_log", "output_artifact": "request_metrics.csv", "output_mode": "as_returned"})

    for key, value in (("max_entries", setup["runtime"]["max_entries"]), ("startup_timeout_s", 30)):
        rows.setdefault("runtime_config", []).append({"service_name": "worker-runtime", "input_artifact": "bundle.json",
                                       "setting_key": key, "setting_value": value})
    rows.setdefault("runtime_config", []).append({"service_name": "status-dashboard", "input_artifact": "request_metrics.csv",
                                   "setting_key": "refresh_s", "setting_value": 60})

    # Before the change the reader sees only `default`, so telemetry shows one copy of each column.
    rows.setdefault("query_telemetry", []).append({"query_id": "q-bundle-fields", "service_name": "bundle-builder",
                                    "principal_name": principal, "window_days": 7, "sampled_runs": 288,
                                    "rows_returned_p50": setup["n_columns"], "artifact_entries_p50": setup["n_columns"]})
    rows.setdefault("query_telemetry", []).append({"query_id": "q-request-log", "service_name": "metrics-exporter",
                                    "principal_name": "svc_metrics", "window_days": 7, "sampled_runs": 2016,
                                    "rows_returned_p50": 5, "artifact_entries_p50": 5})
    for name in rows:
        for row in rows[name]:
            row["system_id"] = case_id
    return rows
