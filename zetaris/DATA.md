# Data README

**All data in this repository is synthetic.** It was generated for Domino, contains no real customer, personal
or confidential data, and describes small made-up systems ("worlds") that exist only as test fixtures.

## Where it comes from
Nothing here is hand-edited. Every CSV is generated from the world case files by one script:
```bash
python3 zetaris/build_sources.py
```
- Each world's engine supplies its facts (`worlds/engines/<engine>/facts.py`).
- The data-quality demo system supplies a planted broken link (`zetaris/dq_demo.py`).
- Re-running the script reproduces the files byte for byte.
- Worlds not yet released are kept on the owner's machine and their rows are added only at load time, so these files hold the released worlds only.

## The tables (Zetaris database `domino_src`)
Each table stands in for a different real-world system, so facts about one change are spread across sources the
way they would be in a company. Every row has `source_system` and `source_row_id` (the prefix names the table).

| File / table | Stands in for (source_system) | Row-ID prefix | Rows | What a row says |
|---|---|---|---|---|
| `change_records` | the change under review (`change_records`) | `cr-` | 7 | one GRANT statement in a proposed change |
| `change_items` | the change under review (`change_records`) | `ci-` | 10 | another item in a change: an ID it targets, a rule it adds, a job it runs |
| `access_grants` | database catalog (`db_catalog`), **served from PostgreSQL** | `ag-` | 22 | a principal's current read grant on a database |
| `table_inventory` | database catalog (`db_catalog`), **served from PostgreSQL** | `ti-` | 22 | a table in a database, with its column count |
| `inventory_records` | record registry (`inventory_registry`) | `ir-` | 20 | a registered record: kind, parent, owner, status |
| `job_definitions` | pipeline repository (`pipeline_repo`) | `jd-` | 11 | a service: identity it runs as, its query, its output file |
| `interface_contracts` | service catalog (`service_catalog`) | `ic-` | 51 | what a component calls, declares or accepts |
| `runtime_config` | runtime configuration (`runtime_config`) | `rc-` | 15 | a service's input file and one setting |
| `query_telemetry` | monitoring (`telemetry`) | `qt-` | 10 | a query's observed results over recent runs |

These are the released worlds (Worlds 1 and 2) plus the `dq-demo` system. Exact counts come from the files.

**The database catalog is a real database.** `access_grants` and `table_inventory` are loaded into a PostgreSQL
container (`domino-catalog-db`, on Zetaris's Docker network). Zetaris reads them over JDBC as the datasource
`catalog_db`, so the USL joins a live database with file sources. The CSVs stay in the repo as their source of
truth, and for sample mode.

## How it gets into Zetaris
```bash
python3 zetaris/setup.py
```
1. **files:** copies the CSVs into the Zetaris file store under `domino/`
2. **catalogdb:** starts PostgreSQL, loads `access_grants` and `table_inventory`, and builds two small lookup tables (`principal_refs`, `database_refs`). Its password is generated into `.env` and masked in every log.
3. **sources** (`sql/01_sources.sql`): `CREATE DATASOURCE catalog_db` (PostgreSQL over JDBC) and `REGISTER DATASOURCE TABLES`, then `CREATE LIGHTNING FILESTORE TABLE <name> FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/<name>.csv", header "true", inferSchema "false")`. Every value is a string; the USL casts.
4. **usl** (`sql/02_usl.sql`): compiles and activates the Unified Semantic Layer `lightning.metastore.domino.systems`, including the cross-source `dependency_edge` table
5. **dq** (`sql/04_dq.sql`): registers the custom data-quality rules
6. **access** (`sql/03_access.sql`): read-only grant for the agent user (plus two UI steps, see `zetaris/README.md`)
7. **report** (`dq_report.py`): runs every data-quality rule and saves the findings

## Checking it
- `python3 -m data_layer tables` lists the USL tables, their columns and sources.
- `python3 zetaris/dq_report.py` shows every data-quality rule's results, with invalid rows listed rather than hidden.
- `scorecard/leakage_check.py` checks that no file here gives away a world's expected outcome.
