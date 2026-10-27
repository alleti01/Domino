# Domino data formats: what the dashboard reads (v0.2)

**Owner:** Adhvik (UI). The agent and data layer *write* these files; the dashboard only *reads* them.
**Status:** the investigation trace now follows **Abhi's agent contract**, replacing the v0.1 trace proposed here earlier. The manifest, scorecard and Zetaris files below are dashboard formats.

## Why
The dashboard must run from a fresh clone with **no keys and no database**. So the agent saves each investigation to files and the dashboard reads them. Everything under `samples/` is bundled into the dashboard at build time.

## Folder layout
```
samples/
  runs/<run_id>/trace.jsonl   REQUIRED  one investigation, one event per line   (agent: runs/<run_id>/)
  runs/<run_id>/summary.json  optional  RunSummary                              (agent)
  runs/<run_id>/bundle.json   optional  EvidenceBundle: row facts, mitigation   (agent)
  receipts.jsonl              optional  Nightshift receipts by request ID      (agent: runs/receipts.jsonl)
  manifest.json               optional  names cases and their order             (Adhvik)
  scorecard.json              optional  measured results                        (Anish)
  zetaris.json                optional  sources, compiled USL, DQ results       (Anish)
```
**To add runs, copy the agent's `runs/<run_id>/` folders into `samples/runs/`.** The dashboard finds every `trace.jsonl` on its own. Until at least one exists, it shows labelled placeholders.

Before committing anything to `samples/`, run `npm --prefix ui run check:secrets`. The build also runs it and fails if it finds anything that looks like a key or token.

## 1. Investigation trace: Abhi's contract
The shapes are defined in `contracts/agent/types.ts` (`CONTRACT_VERSION` 0.1.0) on Abhi's branch; see also `contracts/agent/README.md`. The dashboard's copy of those types is `ui/src/data/format.ts`. In short:

- **`trace.jsonl`:** one `TraceEvent` per line, ordered by `seq`. Every event carries `run_id`, `seq`, `ts`, `mode` and `replay`.
- **Event types:** `run_started`, `change_parsed`, `usl_query`, `dependency_path`, `hypothesis`, `experiment_requested`, `experiment_result`, `revision`, `memory`, `model_call`, `verdict`, `review`, `error`, `run_finished`.

How the dashboard reads them:

| Contract detail | What the dashboard does |
|---|---|
| Evidence is cited by **row ID** (`g1`, `config_repo:con-0005`) or **experiment ID** (`x1`) | Every ID opens the evidence panel. Rows get their facts from `dependency_path`, `usl_query` and `bundle.json`. An ID cited but never seen in the trace is flagged as a data warning. |
| `hypothesis` events restate the hypothesis each time | The latest event wins; earlier statuses are shown as "Revised: open → supported". |
| `experiment_requested` uses a pending ID; the next `experiment_result` carries the real one | Each request is paired with the result that follows it. A run passes or fails from the world's own `assertions`; `completed: false` shows as "Did not finish". |
| `verdict.causal_chain` edges are text, e.g. `"builder produces items.list"` | Matched to `dependency_path` edges (`from relation to`) to draw the chain. The full graph is shown separately. |
| `verdict.limitations` may hold `"- a\n- b"` | Split into one bullet per line. |
| `replay: true` | The report and PR view say "Replayed from a recording". |
| `review` events (a second model checks the explanation, never the verdict) | Shown under the verdict: approved, sent back or flagged, with every unsupported claim and the reviewer model. A flagged review is also noted on the verdict banner and PR view. |
| `verdict.causal_chain[].detail` and labels vs graph IDs | Chain links show their detail (e.g. `max_entries=200`). Links are matched to the graph by ID or by label. A limit's value is shown only when a link or cited row states it. |
| `mode` other than `full` | Shown as a comparison run (reduced mode), listed after full Domino runs and not counted in "match the expected verdict". |
| `summary.outage: true` | Shown as an outage, excluded from scoring. |
| `verdict.decided_by` isn't `deterministic_judge` | Shown as a warning. |
| The model's wording says "safe", "verified", "guaranteed" or "prevents" | Shown exactly as written, with a note that no verdict means safe in production. |
| `bundle.json` / `summary.json` for a different `run_id` | Ignored, with a warning. |

## 2. `manifest.json` (optional)
Names cases, sets their order, and groups runs into cases by the agent's `change_id`. Runs whose `change_id` isn't listed get a case of their own, named after the change title.
```json
{
  "schema_version": "0.2",
  "scorecard": "scorecard.json",
  "zetaris": "zetaris.json",
  "cases": [
    {
      "case_id": "cloudflare",
      "label": "Cloudflare-inspired",
      "kind": "inspired",
      "description": "One sentence on the mechanism being simulated.",
      "change_ids": ["<agent change_id>"],
      "expected_verdict": "reproduced_failure"
    }
  ]
}
```
- `kind`: `inspired` (simulation of a real incident's mechanism), `held_out` (surprise case), `safe` (safe change), `practice`, `other`.
- `expected_verdict` is **optional**. Leave it out for held-out cases if the ground truth must stay private (Anish's leakage check). Results then shows "Not published".

## 3. `scorecard.json` (Anish, optional)
```json
{
  "schema_version": "0.1",
  "generated_at": "2026-10-26T12:00:00Z",
  "runs_included": ["run_id"],
  "metrics": [
    { "key": "failure_recall", "label": "Failure recall", "value": 1.0, "display": "4/4", "n": 4,
      "definition": "Dangerous changes detected / all dangerous changes" }
  ],
  "cases": [
    { "case_id": "cloudflare", "expected_verdict": "reproduced_failure",
      "runs": [ { "run_id": "…", "verdict": "reproduced_failure" } ] }
  ],
  "baselines": [
    { "key": "A_static", "label": "Static checks only",
      "per_case": { "cloudflare": "no_failure_observed" }, "metrics": { "failure_recall": "1/4" } }
  ]
}
```
- Values are **format only**. Real numbers come from Anish's measurements, and a metric with `display: null` shows "Not yet measured".
- `case_id` matches the manifest's `case_id`. Always include `n`.
- Suggested baseline keys follow the vision doc's ladder: `A_static`, `B_nemotron_only`, `C_no_experiments`, `D_full_domino`, `E_no_usl`.

## 4. `zetaris.json` (Anish, optional)
```json
{
  "schema_version": "0.1",
  "compiled_at": "2026-10-25T10:00:00Z",
  "sources": [ { "source_id": "grant_catalog", "name": "Grant catalog", "kind": "db_catalog",
                 "tables": ["grants"], "row_count": 120, "onboarded_at": "…" } ],
  "usl": { "name": "domino_usl", "compile_status": "success", "compile_output": "COMPILE USL output",
           "entities": [], "relationships": [ { "from": "principal", "to": "table", "via": "grants" } ] },
  "dq_rules": [ { "rule_id": "dq1", "name": "Service-version keys are unique", "expression": "RUN DQ …",
                  "status": "fail", "checked_rows": 120,
                  "invalid_rows": [ { "row_id": "B-009", "source": "grant_catalog", "reason": "duplicate key" } ] } ]
}
```
This feeds **Under the hood**, the Zetaris proof judges look for: sources onboarded → USL compiled → queried (counted from the traces) → data-quality rule with rejected rows shown.

## Rules for every file
1. **No secrets.** No Nightshift Runtime token, NVIDIA key, Zetaris credentials or connection strings. The build scans for them.
2. **Only what actually happened.** Replays say `replay: true`; outages say `outage: true`.
3. **The verdict comes from the deterministic judge, not the model.** It is only ever `reproduced_failure`, `no_failure_observed` or `inconclusive`.
