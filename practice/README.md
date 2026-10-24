# Practice scenarios (for building the investigation agent)

Ten **made-up** scenarios for developing and tuning the agent loop before the real worlds are wired in.
None is a real system. Pure Python 3.9 standard library: no Zetaris, no Docker, no keys.

The module offers **the same four calls, with the same result shapes, as the real data layer** (contract v0.3).
Code written against `practice` works against `data_layer` by changing the import:

```python
from practice import describe_world, dependency_path, list_tables, lookup, run_experiment, list_worlds
# later: from data_layer import describe_world, dependency_path, list_tables, lookup, run_experiment, list_worlds
```

## Try it
```bash
python3 -m practice list
```
```bash
python3 -m practice tables
```
```bash
python3 -m practice describe p01
```
```bash
python3 -m practice path p01/change/1203
```
```bash
python3 -m practice lookup "SELECT subject, key, value, source_system, source_row_id FROM telemetry WHERE system_id = 'p07'"
```
```bash
python3 -m practice run p01 candidate
```
```bash
python3 -m practice check
```

## What an investigation looks like
1. `describe_world(id)` returns the change (`change.diff`, `change.entity_id`) and the components.
2. `dependency_path(change.entity_id)` returns the downstream chain across sources. Every edge has `edge_status` (`observed` / `inferred` / `unresolved`), a `detail` with the facts on it, and `evidence` rows.
3. `lookup(sql)` runs read-only SQL for anything else. **Ask `list_tables()` for the table names and columns; don't hard-code them.** The real data layer has different tables with long names. Here the tables are `config_repo`, `telemetry`, `code_index`, `db_catalog`, `schema_registry` and `dependency_edge`. In both, filter by `list_tables()["system_column"]` (`system_id`) = the world ID.
4. `run_experiment(id, "baseline" | "candidate" | "control")` runs a deterministic simulation and returns `passed`, assertions, metrics, logs and hashes.
5. The verdict is one of `reproduced_failure` / `no_failure_observed` / `inconclusive`, **with the mechanism explained.**

## The scenarios
| ID | Change |
|---|---|
| p01 | Shorter acknowledgement timeout on the payments queue |
| p02 | Shorter acknowledgement timeout on the refunds queue |
| p03 | Scale the checkout API for peak traffic |
| p04 | Scale the search API for peak traffic |
| p05 | Standardise event timestamps |
| p06 | More aggressive client retries |
| p07 | Debug logging for the payments service |
| p08 | Tighter timeout on tax calls |
| p09 | Run the invoice export more often |
| p10 | Add an optional promo code column |

Some break and some are safe, including close calls, so "always say it breaks" scores badly.

## Scoring
`answers.json` has the expected verdict, the explanation and the key evidence for each scenario.
**The agent must never read `answers.json` during a run.** Only your scoring script may.
Score both: was the verdict right, and **did the explanation name the real mechanism**?
`run_experiment` alone can tell you *whether* something breaks; only reading the evidence explains *why*.

## Rules
- Results always have the same fields whatever their `status` (`ok`, `error`, `timeout`, `unavailable`, `not_in_sample`). Check `status`, not whether a key exists.
- Values from `lookup` are strings, as in Zetaris.
- `mode` is `"practice"`, so the real scorecard never mixes these up with real results.
- `dependency_path` carries `dq_issues` (data-quality findings). It's always empty here; the real data layer fills it from Zetaris.

**v0.3 changes:**
- `scenario_id` is renamed `system_id`, to match the real data layer
- new `list_tables()` / `tables` command
- `dq_issues` added to `dependency_path`
- `row_ids` name their source system even when a query doesn't select `source_system`
