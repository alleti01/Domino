# Zetaris (Person 1)

- `sources/`: synthetic source files copied into the Zetaris file store
- `sql/`: registration DDL, `COMPILE USL`, `ACTIVATE`, DQ rules, non-admin grants (re-run after every USL rebuild)
- `snapshots/`: saved query results that power sample mode (no Zetaris or keys needed)

All data here is synthetic. Every query is logged to `runs/query_log.jsonl`.
