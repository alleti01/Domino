"""Facts for the `dq-demo` system: a deliberately broken link for the data-quality demonstration.

Not a test world (no case file, no ground truth, no experiment). It exists so Zetaris can show a broken
join being caught instead of silently producing a chain: a change grants access to `svc_ghost_reader` and
a service runs as it, but the catalog has no such principal.

Called by zetaris/build_sources.py; rows are added after the public worlds' rows.
"""

from __future__ import annotations

SYSTEM_ID = "dq-demo"
MISSING_PRINCIPAL = "svc_ghost_reader"


def facts() -> dict:
    title = "Grant the report reader access to events"
    return {
        "change_records": [{"change_id": "0099", "file_path": "db/migrations/0099_report_reader.sql", "statement_seq": 1,
                            "action": "GRANT", "privilege": "SELECT", "principal_name": MISSING_PRINCIPAL,
                            "database_name": "default", "title": title}],
        "access_grants": [{"principal_name": "svc_events_writer", "database_name": "default", "privilege": "SELECT"}],
        "table_inventory": [{"database_name": "default", "table_name": "events", "column_count": 14}],
        "job_definitions": [{"service_name": "report-builder", "runs_as_principal": MISSING_PRINCIPAL,
                             "query_id": "q-events-daily",
                             "query_text": "SELECT day, count(*) FROM default.events GROUP BY day",
                             "reads_table": "events", "output_artifact": "daily_report.csv",
                             "output_mode": "as_returned"}],
    }
