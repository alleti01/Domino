# Data-layer interface contract — v0.1 (DRAFT, needs Abhi's sign-off)

How Abhi's agent calls Anish's data layer. Three calls, one Python import:

```python
from data_layer import lookup, dependency_path, run_experiment, describe_world
```

Each call also works from the shell, so it can be tested without the agent:

```bash
python3 -m data_layer lookup "SELECT * FROM <usl table> LIMIT 5"
python3 -m data_layer path <entity_id>
python3 -m data_layer run <world_id> candidate
```

Each call returns one JSON-serializable dict. **It never raises for an expected failure,
such as a timeout, Zetaris being down or an unknown world.** Check `status` instead.
Fake samples of every shape live in [`samples/`](samples/).

## Guarantees

| | |
|---|---|
| Read-only | `lookup` and `dependency_path` run as a **non-admin, read-only** Zetaris user. Only `SELECT` / `WITH` / `SHOW` / `DESCRIBE` statements are accepted. |
| Bounded | Every call has a timeout (`timeout_s`) and at most 2 retries, only for "unavailable" errors. |
| Evidence | Every Zetaris query is logged (SQL, returned row IDs, duration) and has a `query_id` you can cite. |
| Modes | `mode` is on every result: `fake` (canned samples), `sample` (saved real snapshots, no Zetaris needed), `live`. The scorecard rejects `fake` results. |
| No leakage | Nothing returned names a root cause, a failure family or an expected verdict. World IDs and component names are neutral. |

`status` values: `ok`, `timeout`, `unavailable` (Zetaris/HTTP 5xx/network: **not** an agent mistake), `error` (bad request, such as SQL syntax, an unknown world or a refused statement), `not_in_sample` (sample mode has no snapshot for this request).

---

## 1. `lookup(sql, limit=1000, timeout_s=30)`

Runs one SQL statement against the USL and returns the rows. Every USL table carries
`source_system` and `source_row_id` columns, so each row points back to its origin.

```json
{
  "contract_version": "0.1",
  "call": "lookup",
  "mode": "live",
  "status": "ok",
  "query_id": "q-7f3c…",
  "sql": "SELECT …",
  "columns": ["entity_id", "…", "source_system", "source_row_id"],
  "rows": [{"entity_id": "…", "source_system": "grant_catalog", "source_row_id": "gc-0042"}],
  "row_count": 1,
  "row_ids": ["grant_catalog:gc-0042"],
  "truncated": false,
  "duration_ms": 812,
  "error": null
}
```

Values arrive as **strings** (Zetaris returns every value as a string). Numeric columns are cast in the USL, but expect strings anyway and convert them yourself.

## 2. `dependency_path(entity_id, max_hops=6, timeout_s=60)`

Starting from a changed entity (e.g. the principal or rule touched by the PR), returns the
downstream chain **as joined by the Zetaris USL**. The join itself runs in Zetaris. Every edge has an
`edge_status` and its evidence rows.

```json
{
  "contract_version": "0.1",
  "call": "dependency_path",
  "mode": "live",
  "status": "ok",
  "start": {"entity_id": "w-…/change/0042", "entity_type": "change"},
  "paths": [
    {"hops": [
      {"from": "w-…/principal/…", "from_type": "principal", "to": "w-…/service/…", "to_type": "service",
       "relation": "identity_of", "edge_status": "observed", "detail": "service runs as …",
       "evidence": [{"source_system": "pipeline_repo", "source_row_id": "jd-0005", "query_id": "q-…"},
                    {"source_system": "db_catalog", "source_row_id": "ag-0010", "query_id": "q-…"}]}
    ],
     "source_systems": ["change_records", "db_catalog", "pipeline_repo"],
     "meets_two_source_rule": true}
  ],
  "unresolved": [
    {"from": "…", "to": "…", "relation": "…", "reason": "referenced entity not found in any other source", "evidence": […]}
  ],
  "edges_considered": 20,
  "query_ids": ["q-…"],
  "duration_ms": 3400,
  "error": null
}
```

- **Where to start:** `describe_world(world)["change"]["entity_id"]` is the changed entity, for example `w-k7m2/change/0042`.
- **Entity IDs** are `<system>/<kind>/<name>`. Kinds: `change`, `principal`, `database`, `table`, `service`, `query`, `artifact`, `setting`.
- **Relations:** `grants_to`, `grants_on`, `identity_of`, `contains`, `reads`, `executes`, `writes`, `loaded_by`, `configured_with`. `detail` carries the facts on the edge, for example `column_count=…` or `<setting>=<value>`.
- **`edge_status`:**
  - `observed`: two independent sources agree on the link.
  - `inferred`: only one source states the link, or it was matched on a name alone.
  - `unresolved`: the link points at something no other source has. A DQ failure shows up here instead of being dropped.
- **Two-source rule:** each path lists its `source_systems` and whether it `meets_two_source_rule`. Per the product invariant, a reported risk needs at least two independent sources.
- **Live behaviour:** one Zetaris query per call against `lightning.metastore.domino.systems.dependency_edge`, taking about 3–7 s on a laptop. The cross-source joins happen inside Zetaris, when the USL table is activated.

## 3. `run_experiment(world, variant, params=None, timeout_s=60)`

Runs one world in a disposable local process. `variant`: `baseline` (before the change),
`candidate` (with the change), `control` (change reverted, or a causal control).
`params` is optional and world-specific; `describe_world(world)` lists what each world accepts
and what it can observe.

```json
{
  "contract_version": "0.1",
  "call": "run_experiment",
  "mode": "live",
  "status": "ok",
  "experiment_id": "x-…",
  "world": "w-…",
  "variant": "candidate",
  "params": {},
  "passed": false,
  "assertions": [
    {"name": "consumer_accepts_input", "passed": false, "observed": "…", "expected": "…"}
  ],
  "metrics": {"<component>.<metric>": 0},
  "artifacts": [{"name": "…", "sha256": "…", "bytes": 0}],
  "logs": ["…"],
  "reproduce": {"command": "python3 -m data_layer run w-… candidate", "input_sha256": "…"},
  "duration_ms": 0,
  "error": null
}
```

- `passed` is set by deterministic assertions, never by a model.
- The same world, variant and params give the same hashes and metrics on every run.
- `status: ok` with `passed: false` is a **reproduced failure**. `status: error` means the experiment itself couldn't run.

### `describe_world(world)` / `list_worlds()`

`list_worlds()` returns the world IDs only. `describe_world(world)` returns the world's components
(neutral names), the change under review (the PR diff), accepted `params`, and available metrics. It
contains **no hints** about what might break.

---

## Open questions for Abhi
1. Do you want `lookup` to take raw SQL, or a small set of named queries? Raw SQL gives the agent more freedom, and Zetaris enforces read-only.
2. Should `dependency_path` also go **upstream** (who feeds this entity)?
3. Is `params` free-form OK, or do you want a fixed set (e.g. `probes: [...]`) per world?
4. Python import vs. a local HTTP endpoint? Import is simplest. HTTP only if your loop runs in another process or language.
