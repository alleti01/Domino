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
