# Domino investigation agent (Abhi)

TypeScript. Investigates a proposed change: maps it through the semantic layer, forms falsifiable hypotheses, picks discriminating experiments, revises, and hands the verdict to a deterministic judge. Every model call goes to **NVIDIA Nemotron through Meterless Nightshift**, and every receipt is logged.

## For judges: run it with no keys
```bash
cd agent && npm install && npm run demo
```
`demo/` holds recordings of real investigations (Nemotron via Nightshift on the practice data layer). `npm run demo` **re-runs the real agent code** against each recording: the tool gateway, Meterless World Model, harness confirmation and deterministic judge all execute again and must reach the recorded verdict. No Nightshift, no Zetaris, no Python, no keys. Every event in a replayed trace is marked `replay: true`, and the recorded Nemotron receipts are shown as recorded, never as live calls.

## Setup
```bash
cd agent
npm install
cp .env.example .env   # optional: Nightshift's token is read from its own file on macOS
npm test               # unit + feature tests, no network
npm run smoke          # one real Nemotron call through Nightshift, prints the receipt
npm run conformance:world-model   # official Meterless World Model conformance suite
```
Needs Nightshift running locally with only Nemotron lanes seated (e.g. `nvidia/nemotron-3.5-lightning-30b-a3b`).

## Run an investigation
```bash
npm run investigate -- --change p03                       # Anish's practice scenario p03 (repo root ../practice)
npm run investigate -- --change p03 --mode no_experiments # scorecard modes: full | no_tools | no_experiments | no_usl
npm run investigate -- --change p03 --memory runs/memory  # persist the World Model across runs
npm run eval -- --set dev                                  # score on the dev practice set
```
Outputs go to `runs/<run_id>/`: `trace.jsonl` (for the dashboard), `summary.json`, `cassette.json` (the recording `npm run replay -- <cassette>` re-runs), plus `runs/receipts.jsonl`.

**Reliability:**
- A pre-run health check (Nightshift up, token valid, Nemotron offered) marks the run an **outage** instead of a wrong answer.
- Model outages mid-run are flagged the same way.
- One retry if Nightshift routes to a non-Nemotron model.
- Every run's prompt carries its own id so Nightshift never serves a cached answer; `cache_hits` and `model_failures` are counted in `summary.json`.

## Layout
| Path | What |
|---|---|
| `src/agent.ts` | investigation loop, harness confirmation, verdict |
| `src/tools.ts` | typed tool gateway: read-only SQL, citation guard, budgets, paired baselines |
| `src/judge.ts` | deterministic verdict (baseline pass + repeated candidate fail + control pass) |
| `src/llm/` | Nightshift client (provider contract v4) and receipt parsing (`meterless.compute_receipt.v1`) |
| `src/engines/worldModel.ts` | Meterless World Model as investigation state, `inspect_world_model`, causal-chain traversal |
| `src/adapters/practice.ts` | adapter to Anish's data layer CLI (`practice` now, `data_layer` later) |
| `src/replay.ts` | record / replay of model + data-layer results (judge sample mode) |
| `demo/` | recorded real investigations for `npm run demo` |
| `src/fakes/stubWorld.ts` | throwaway stub, tests only |
| `vendor/meterless-world-model/` | **pre-existing open-source component**: Meterless World Model reference, copied unchanged (Apache-2.0) |
| `../contracts/agent/` | trace + hand-off formats, sample traces for the dashboard |

## Rules this code keeps
- The agent never reads `practice/answers.json`; only `scripts/practice-eval.ts` does, after a run.
- Dev set `p01 p03 p05 p06 p08` is used for tuning; `p02 p04 p07 p09 p10` are held out.
- No secrets in the repo: the Nightshift token is read at runtime, and the NVIDIA key lives in Nightshift.
