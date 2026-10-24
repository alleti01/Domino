# Zetaris (Person 1)

All data here is synthetic. Every query Domino runs is logged to `runs/query_log.jsonl`.

```
zetaris/
├── build_sources.py   generates sources/*.csv from the world case files
├── setup.py           one command: copy files -> register sources -> compile + activate USL -> grant access
├── sources/           six synthetic CSVs from four independent source systems
├── sql/               01_sources.sql, 02_usl.sql, 03_access.sql (statements separated by a line holding only ";")
└── snapshots/         saved query results that power sample mode (no Zetaris or keys needed)
```

## Build or rebuild
```bash
python3 zetaris/setup.py
python3 zetaris/setup.py --rebuild-usl
python3 zetaris/setup.py --dry-run
```
`--rebuild-usl` removes the USL first. A rebuilt USL gets a new ID, and access is re-granted automatically.

**First-time UI steps.** The SQL grant isn't enough on its own; see `sql/03_access.sql`:
1. Management → Permissions → agent user → **View** on Unified Semantic Layer
2. Unified Semantic Layer → `domino` → Access Control → **Assign Users** → agent user

## Sources (database `domino_src`)
| Table | Source system | Holds |
|---|---|---|
| `change_records` | change_records | statements in the proposed change |
| `access_grants` | db_catalog | current read grants per principal and database |
| `table_inventory` | db_catalog | tables per database with column counts |
| `job_definitions` | pipeline_repo | which identity each service runs as, its query and output file |
| `runtime_config` | runtime_config | which file each service loads, and its settings |
| `query_telemetry` | telemetry | observed query results over recent runs |

## USL `lightning.metastore.domino.systems`
- **Entity tables:** `principal`, `database_entity`, `data_table`, `access_grant`, `change_statement`, `job`, `runtime_setting`, `query_observation`.
- **Keys:** canonical IDs of the form `<system>/<kind>/<name>`. The foreign keys make Zetaris generate DQ rules (`LIST DQ USL lightning.metastore.domino.systems`).
- **`dependency_edge`:** the cross-source join, done inside Zetaris at activation. Each edge is labelled `observed`, `inferred` or `unresolved` and cites its source rows. `data_layer.dependency_path` reads it with one query.

## Data quality
- **Rules:** Zetaris generates key rules from the USL's PRIMARY / FOREIGN KEYs; `sql/04_dq.sql` adds custom ones. One of them, `resolved_link`, flags any cross-source link that points at nothing.
- **Report:** `python3 zetaris/dq_report.py` runs every rule (`LIST DQ USL` → `RUN DQ`) and prints the invalid records (`SHOW DQ INVALID RECORD`) instead of hiding them. A copy is saved to `snapshots/dq_report.json`.
- **Planted broken link:** the `dq-demo` system (`dq_demo.py`) is not a test world. Its change grants access to `svc_ghost_reader` and a service runs as it, but the catalog has no such principal. Zetaris catches it with both foreign-key rules and `resolved_link`, and `dependency_path("dq-demo/change/0099")` lists both broken links under `unresolved`, so the agent is told the chain can't be trusted.

## Gotchas met while building
- **File-store root:** `dffs://` paths resolve under `/home/zetaris/customer-data/<org-id>/file-store/`, not `shared/`. `setup.py` finds it automatically.
- **Register order:** copy a file into the store before registering it. A table registered against a missing file returns no rows.
- **`NOT NULL` columns:** these need `COALESCE(...)` in `ACTIVATE`, or activation fails with "Schema mismatch".
- **Response format:** results come back as `{"headers", "data", "total", "timeUsed"}`, with every value a string.
- **Speed:** a query takes about 1–7 s on an Apple Silicon laptop, because the platform images run under Rosetta.
