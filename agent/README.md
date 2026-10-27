# Domino investigation agent (Abhi)

TypeScript. Investigates a proposed change: maps it through the semantic layer, forms falsifiable hypotheses, picks discriminating experiments, revises, and hands the verdict to a deterministic judge. Every model call goes to **NVIDIA Nemotron through Meterless Nightshift**, and every receipt is logged.

## NVIDIA Nemotron: which model does what
Both models are called **through Meterless Nightshift** (the app's only AI provider); each request names its model explicitly, and every Nightshift receipt (`meterless.compute_receipt.v1`, `winning_route.model`) is logged to `runs/receipts.jsonl` and to the trace as a `model_call` event.

| Role | Model | What it does in Domino |
|---|---|---|
| **Investigator** | `nvidia/nemotron-3.5-lightning-30b-a3b` | Plans the investigation: follows the dependency path through the semantic layer, writes SQL, forms falsifiable hypotheses, chooses which experiment discriminates between them, revises, explains, proposes a mitigation. Uses tool calling through a typed gateway. |
| **Independent reviewer** | `nvidia/nemotron-3-ultra-550b-a55b` | A different, larger Nemotron checks every factual statement, the mechanism and the mitigation against the evidence the run actually retrieved. Problems go back to the investigator for revision (up to 2 rounds); anything still disputed is printed in the report's limits. |
| *(not a model)* **Judge** | deterministic code | Decides the verdict from experiments: baseline pass + repeated candidate fail + control pass. Neither model can set it. |

Override with `DOMINO_INVESTIGATOR_MODEL` / `DOMINO_REVIEWER_MODEL`; disable the reviewer with `--no-critic`.

## For judges: run it with no keys
```bash
cd agent && npm install && npm run demo      # or, once published: npx domino-check demo
```
`demo/` holds five recordings of real live investigations (Nemotron via Nightshift, live Zetaris), made with the current agent: pull requests #1 and #2 from [the demo repo](https://github.com/abhijandyala/domino-demo-shop) (w-c5h2 breaks, w-f8w3 does not), plus w-k7m2, the near-miss w-h9c5 and w-g4k8 from the scored batch. How the command runs end to end: [docs/how-it-runs.md](docs/how-it-runs.md). `npm run demo` **re-runs the real agent code** against each recording: the tool gateway, Meterless World Model, harness confirmation and deterministic judge all execute again and must reach the recorded verdict. No Nightshift, no Zetaris, no Python, no keys. Every event in a replayed trace is marked `replay: true`, and the recorded Nemotron receipts are shown as recorded, never as live calls.

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

## The `domino` command
```bash
cd agent && npm install && npm link    # once; then `domino` (or `domino-check`) works from any folder
domino doctor                           # Node, Python, data layer mode + read-only Zetaris login, Nightshift + a real Nemotron call, gh
domino run --change w-k7m2              # one live investigation (scorecard modes: --mode full | no_tools | no_experiments | no_usl)
domino dashboard --open                 # the dashboard, showing runs as they happen
domino pr 1 --repo owner/name [--post]  # check one pull request
domino watch --repo owner/name --post   # check every new commit on every open pull request
domino replay <cassette.json> · domino demo · domino report <run_dir>
```
Settings: `--data-repo` or `DOMINO_DATA_REPO` (in `agent/.env`) is the checkout whose data layer runs live; runs go to `agent/runs/live/run-*/` (`trace.jsonl` appended as the run happens, then `summary.json`, `bundle.json`, `report.md`, `cassette.json`), receipts to `agent/runs/live/receipts.jsonl`. Exit codes: 0 finished, 1 failure reproduced (with `--fail-on-break`), 2 error, 3 outage or inconclusive. Don't type `npx domino`: that downloads an unrelated npm package.

**Pull requests.** `pr` and `watch` read a PR's diff with `gh` (PR code is never checked out or run). The repo's `domino.json` maps folders to modelled systems; a folder is checked only when its change equals the one modelled for that system, otherwise it is reported as not covered. With `--post`, Domino posts one comment (edited in place on later pushes) and a `domino/check` commit status. Demo: [abhijandyala/domino-demo-shop](https://github.com/abhijandyala/domino-demo-shop). Running it in CI: [docs/ci.md](docs/ci.md).

`npm run eval -- --set dev` scores Anish's practice scenarios (`domino run --change p03 --data practice --data-repo ..`).

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
- The agent only calls the data layer's CLI. It never reads `ground_truth/`, `~/domino-private`, `worlds/demo_view.py`, `runs/demo_views/` or `runs/site_data/` (they show outcomes directly).
- `agent/runs/` is never committed (it can hold held-out world ids).

## Batch runs for the scorecard
`npx tsx scripts/run-worlds.ts --repo <anishalleti checkout> --mode <full|no_tools|no_experiments|no_usl> [--worlds a,b]` writes `runs/worlds/<mode>-<stamp>/results.json`. Each row has `world, mode, run_id, verdict, prediction, review, experiments, calls, secs, outage, nemotron, cache_hits, model_failures`. Anish grades with `run_scorecard.py --import <folder>`. The World 3 plan is in [docs/world3-run-plan.md](docs/world3-run-plan.md).
