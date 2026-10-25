# Demo view: data for the dashboard's "what the system did" screens

For Adhvik (dashboard). One JSON per world, with the same fields for every world, so one screen design
works for all of them. Made by Anish's `worlds/demo_view.py`; Python 3.9, no installs, no Zetaris needed.

```bash
DOMINO_DATA_MODE=sample python3 worlds/demo_view.py --all              # -> runs/demo_views/<world>.json
DOMINO_DATA_MODE=sample python3 worlds/demo_view.py w-k7m2             # print one world
python3 worlds/demo_view.py --all --out samples/demo_views             # the dashboard's bundled data
```

**Not for the agent.** A view runs all three versions of the system, so it shows each world's outcome.
The script writes only to `runs/demo_views/` (git-ignored) or the dashboard's `samples/demo_views/`, which
the dashboard bundles and the agent never reads. Worlds
that aren't released yet are left out of `--all`; World 3 appears after it is published at the freeze.

## Fields
| Field | What it holds | Screen idea |
|---|---|---|
| `world`, `title`, `synthetic` | world id, the change's title, always `true` | header + "synthetic" badge |
| `change` | `entity_id`, `title`, `description`, `files`, `diff` (unified diff text) | the PR card |
| `components[]` | `name`, `role`, and `by_variant.<variant>` = `metrics` (short names) + `logs` + `status` | one panel per service |
| `variants[]` | `variant`, `label`, `passed`, `failed_checks[]`, `checks[]`, `other_logs[]` | before / with change / reverted tabs |
| `changed_metrics[]` | `component`, `metric`, `baseline`, `candidate`, `control` (only metrics that differ) | the "what moved" table |
| `dependency` | `nodes[]` (`id`, `type`), `edges[]` (`from`, `to`, `relation`, `edge_status`, `detail`, `evidence[]`), `unresolved[]`; or `status: "not_available"` | the path graph from Zetaris |
| `reproduce` | the command for each variant | "run it yourself" |

`status` per service and run: `failed` when the service reports a non-zero `exit_code`, `changed` when any of
its numbers differ from the baseline run, otherwise `ok`. It is computed from the numbers alone, the same way
for every world.

Variants: `baseline` = system without the change, `candidate` = with it, `control` = change applied then
reverted. `edge_status` is `observed` (two sources agree), `inferred` or `unresolved`. `evidence[]` lists
the source rows (`source_system`, `source_row_id`) behind each link.

## Shape (made-up values)
```json
{
  "world": "w-0000", "title": "Example change", "synthetic": true,
  "change": {"entity_id": "w-0000/change/0001", "title": "...", "description": "...", "files": ["..."], "diff": "..."},
  "components": [{"name": "service-a", "role": "...", "by_variant": {
    "baseline":  {"metrics": {"items": 10}, "logs": ["started"]},
    "candidate": {"metrics": {"items": 20}, "logs": ["..."]},
    "control":   {"metrics": {"items": 10}, "logs": ["started"]}}}],
  "variants": [{"variant": "baseline", "label": "system without the change", "passed": true,
                "failed_checks": [], "checks": [{"name": "...", "passed": true, "observed": "...", "expected": "..."}],
                "other_logs": []}],
  "changed_metrics": [{"component": "service-a", "metric": "items", "baseline": 10, "candidate": 20, "control": 10}],
  "dependency": {"status": "ok", "mode": "sample", "nodes": [{"id": "w-0000/change/0001", "type": "change"}],
                 "edges": [{"from": "...", "to": "...", "relation": "...", "edge_status": "observed", "detail": "...",
                            "evidence": [{"source_system": "...", "source_row_id": "...", "query_id": "..."}]}],
                 "unresolved": []},
  "reproduce": {"baseline": "python3 -m data_layer run w-0000 baseline", "candidate": "...", "control": "..."}
}
```
Names, roles and metric names are neutral by design; show them as they are. Any credit to the public
incident a world is modelled on belongs in the deck or video, after the freeze.
