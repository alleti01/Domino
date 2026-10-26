# Domino hand-off contracts (DRAFT v0, agree at kickoff)

The only things that cross between the three areas. Exact field shapes are in [`types.ts`](types.ts) (TypeScript, but plain JSON on the wire, so any language works).

## 1. Worlds & evidence: Anish → agent
| Thing | What it is |
|---|---|
| `ChangeRequest` | The PR Domino investigates: title, description, diff. **Neutral wording, never names the failure.** |
| `QueryResult` | Rows from the Zetaris USL, each with `row_id` + `source`, plus the exact SQL. `from_snapshot` = sample mode. |
| `DependencyPath` | The cross-source chain the USL can establish around a changed entity (nodes/edges, observed vs inferred) + RUN DQ issues. Data, not conclusions. |
| `ExperimentCatalog` | Per world: variants, generic params, observables, workloads. **No hints about the bug.** |
| `ExperimentResult` | Result of running one variant: observations, the world's own assertions, logs, artifact hashes. |

**How the agent calls it (proposal):** a CLI that prints JSON, so it works from any language:
`worlds list-changes` · `worlds catalog <world_id>` · `worlds run '<ExperimentRequest JSON>'` · `evidence query '<sql>'` · `evidence path <change_id>`.
An HTTP service is fine too; just pick one.

**Ground truth** (expected verdict + true mechanism per change) stays in Anish's scorecard area and is never readable by the agent.

**Two conventions the agent relies on (Anish, please follow):**
- Every `ExperimentCatalog.params` entry has a `default` = normal operation. The agent runs defaults unless it deliberately tests a range; a baseline that fails at defaults makes every verdict inconclusive.
- Name world assertions `<component>.<check>` (e.g. `loader.loads_input`), where `<component>` is the same id that appears in the semantic layer / dependency path. The verdict's causal chain is traced from the changed entity to that component.

## 2. Investigation trace: agent → Adhvik
`trace.jsonl`, one `TraceEvent` per line, in order (`seq`). Event types:
`run_started → change_parsed → usl_query / dependency_path → hypothesis → experiment_requested → experiment_result → revision → … → memory (engine use) · model_call (Nightshift receipt) → verdict → run_finished` (+ `error`).

- `verdict` is always one of **reproduced_failure / no_failure_observed / inconclusive**, decided by code (`decided_by: deterministic_judge`), with `tested` + `limitations`.
- `model_call` carries `routed_model` from the Nightshift receipt: the Nemotron proof to show in the UI.
- `replay: true` means rendered from a recording. The UI must say so.
- `memory` events (engine `world_model`) show the Meterless World Model at work: writes (graph, hypotheses), reads (`inspect_world_model`, cross-run recall) and the causal-chain traversal. Worth showing in the UI: it's sponsor-tech evidence.
- `verdict.causal_chain` links are each `{edge, status: observed|inferred, refs: [row_id]}`, traced through the World Model.

**Adhvik:** real sample traces are in [`samples/`](samples/): one `reproduced_failure` and one `no_failure_observed`, produced by the real agent with real Nemotron calls via Nightshift, against a throwaway stub world (not Anish's worlds). Build the UI against these. Note: an `experiment_requested` event's `experiment_id` is a pending handle; the `experiment_result` that follows it carries the real id.

## 3. Scorecard runs: Anish ↔ agent
`domino investigate --change <id> --mode <full|no_tools|no_experiments|no_usl> --out <dir> [--sample]`
→ writes `trace.jsonl`, `receipts.jsonl`, `summary.json` (`RunSummary`).
Mode A (static checks) is Anish's own baseline. `outage: true` runs are excluded from accuracy and reported separately.

## 4. Evidence bundle: agent → Adhvik / README / PR comment
Every run (live or replay) writes `bundle.json` (`EvidenceBundle` in [`types.ts`](types.ts)) and `report.md` (a ready-to-paste PR comment) next to its trace.
It has: the change, the verdict (decided by the deterministic judge), the model's explanation, the causal chain with the facts behind every cited row, every experiment (baseline / candidate / control, who asked for it, reproduce command, artifact hashes), hypotheses, Nemotron call summary, World Model activity, and a **mitigation** that is marked verified only when Domino tested it (section 5).
Samples: [`samples/*.bundle.json`](samples/) and [`samples/*.report.md`](samples/).

## 5. Verified fixes (agent ↔ Anish, agent → Adhvik)
After a reproduced failure, the investigator writes its mitigation as **setting overrides**. The harness then re-runs the world with them applied: candidate + fix twice and baseline + fix once. Code decides the outcome (`judgeFix`):
- **verified**: the candidate passes every time with the fix, and the baseline still passes.
- **failed**: either one fails. The investigator gets one more attempt (`rounds` ≤ 2).
- **untested**: the fix could not be applied or run.

Fix runs never feed the main verdict.

**Anish (worlds):** no world exposes this yet. Until one does, Domino skips the step and the mitigation stays "unverified". To turn it on for a world:
1. `describe <world>` lists what can be changed. Use the same ids the semantic layer uses, and give no hints about the bug:
   `"overridable": [{"target": "loader.max_items", "current": 200, "type": "number", "description": "loader setting"}]`
   It may also be nested as `params.overrides.targets`; the agent reads either.
2. `run` accepts `--params '{"overrides": {"loader.max_items": 300}}'` and applies the override to that system's config before the run. If the target is unknown, return `completed: false` with the reason in `logs_tail`. Never fake a pass.

**Adhvik (UI):**
- `bundle.verdict.fix_verification` is `{status, overrides, experiments, reasons, rounds}`, or `null` when the step did not run.
- `verdict.mitigation.verified` is `true` only when the status is `verified`.
- Each experiment has `fix_overrides`, which is non-null for the fix runs (`requested_by: harness`). The report labels those rows "candidate + fix".
- Render **verified** as a green "Verified fix: …", **failed** as "Suggested fix did not hold", and anything else as "Suggested (unverified)".
