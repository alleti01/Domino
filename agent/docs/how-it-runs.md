# How Domino runs

One npm package, `domino-check`, with one command (also installed as `domino`). Everything below is the same code whether it runs from `npx`, from `npm link`, or in CI.

## Three ways to run it

### 1. Try it with nothing set up
```bash
npx domino-check demo
```
Replays five recorded live investigations through the real agent code: the tool gateway, Meterless World Model, harness confirmation, deterministic judge, citation check and review all run again and must reach the recorded verdict. No Nightshift, Zetaris, Python or keys are needed. Output goes to `./domino-runs/replay/`, and every event is marked `replay: true`; recorded Nemotron receipts are shown as recorded, never as live calls.

| Recording | What it shows |
|---|---|
| `pr1-w-c5h2` | Pull request #1 in the demo repo: failure reproduced, cited cause, a fix that holds but only adds headroom, and an honest "no setting removes the cause" |
| `pr2-w-f8w3` | Pull request #2: the same change on a system that copes; no failure observed, explained from the chain |
| `zetaris-w-k7m2` | Database grant that breaks a downstream service. Raising the limit only adds headroom, so Domino finds the fix that removes the cause: collapse duplicate entries |
| `zetaris-w-g4k8` | Rule change that breaks an interpreter; fix held |
| `zetaris-w-h9c5` | The near-miss grant that is fine |

### 2. Live, on a machine with Nightshift and Zetaris
```bash
npx domino-check doctor                  # Node, Python, data layer + read-only Zetaris login, Nightshift + a real Nemotron call, gh
npx domino-check run --change w-k7m2     # one live investigation
npx domino-check dashboard --open        # the dashboard, showing each step as it happens
```
This needs Nightshift with a Nemotron lane, a Zetaris install with the systems' facts in its semantic layer, and a checkout of the team repo for the data layer and experiment worlds (`--data-repo` or `DOMINO_DATA_REPO`).

### 3. On every pull request
```bash
npx domino-check watch --repo owner/name --post
```
Polls open pull requests with `gh` and checks each new commit once. It posts one comment (edited in place on later pushes) and a `domino/check` commit status that shows in the PR's checks list. Demo: https://github.com/abhijandyala/domino-demo-shop (PRs #1–#3). For CI setups see [ci.md](ci.md).

## What happens in one investigation

1. **Read the change.** Diff, files and the entities it touches (`change.ts`).
2. **Map it.** `get_dependency_path` walks the Zetaris unified semantic layer from the change to its downstream consumers, joining rows from independent sources. Every link keeps its row ids. Read-only `query_usl` fills gaps (`tools.ts`).
3. **Hypothesise.** Nemotron Lightning records falsifiable hypotheses that cite the rows it read. The Meterless World Model holds the graph, hypotheses and experiments with provenance (`engines/worldModel.ts`).
4. **Test.** Baseline vs candidate under the same workload; a baseline is paired automatically.
5. **Confirm.** The harness adds a repeat and a control (change reverted) before a failure can count (`judge.ts`).
6. **Decide.** A deterministic judge sets the verdict from the experiments: `reproduced_failure`, `no_failure_observed` or `inconclusive`. The model never sets it.
7. **Explain.** The investigator writes a cause chain: hops from the change to the failed check (or to the metric that stayed within bounds). Code checks every cite was returned in this run and sends a bad chain back once (`chain.ts`).
8. **Review.** Nemotron Ultra checks each claim against the evidence; problems go back to the investigator for up to two rounds (`critic.ts`).
9. **Fix check.** For a reproduced failure, the proposed fix is applied as setting overrides and the world re-run; the fix counts only if it holds. When it holds with several overrides, code tries each one, keeps only those needed, re-verifies the smaller set, and says whether each override removes the cause (every metric an override can move returns to baseline) or only adds headroom (the checks pass while some stay moved). If the fix only adds headroom, Domino looks for one that removes the cause: code tries every other value of each on/off and fixed-choice setting, the investigator proposes one more, and a candidate that removes the cause and holds on re-verification becomes the fix (`fix.ts`).
10. **Write it up.** `bundle.json` for the dashboard and `report.md` for the PR comment (`bundle.ts`).

Budgets: 20 steps, 26 model calls, 8 queries, 10 experiments, 10 minutes. A Nightshift or Zetaris outage marks the run an outage, never a wrong answer.

## What happens in one pull-request check

1. `gh pr diff` reads the change. PR code is never checked out or run.
2. `domino.json` from the **base** branch says which system each folder deploys to, so a PR cannot remap itself.
3. A folder matches only if its files and changed lines equal the change modelled for that system. Anything else is listed as "not covered" with no verdict.
4. Status → pending, and a "checking" comment.
5. One investigation per matched folder (above).
6. The comment is replaced with the result, and the status is set: failure, success or error.

## What it writes

| File | Contents |
|---|---|
| `run-*/trace.jsonl` | Every step, appended as it happens (the dashboard tails it) |
| `run-*/summary.json` | Verdict, cause, counts, outage flag, all-Nemotron flag |
| `run-*/bundle.json` | Everything the dashboard shows: cited chain, experiments, evidence facts, review, fix check, PR source |
| `run-*/report.md` | The PR comment |
| `run-*/cassette.json` | A recording that `replay` re-runs offline |
| `receipts.jsonl` | Nightshift's receipt for every model call (which model answered) |
| `watch-<owner>-<repo>.json`, `pr-*.md` | Watcher queue, and each posted comment |

Exit codes: `0` finished · `1` failure reproduced (with `--fail-on-break`) · `2` error · `3` outage or inconclusive.

## Code map

```
bin/domino.mjs        launcher: runs the TypeScript through tsx (no build step)
src/cli.ts            commands and flags
src/config.ts         settings, data-layer and runs folders, exit codes
src/doctor.ts         readiness checks
src/runner.ts         one live investigation plus its recording, bundle and report
src/pr.ts             read a PR, match it to a modelled change, comment and status
src/watch.ts          check one PR / watch a repository
src/dashboard.ts      start the dashboard on the runs folder
src/agent.ts          the investigation loop
src/tools.ts          typed tool gateway: SQL guard, citation guard, budgets
src/chain.ts          the cited cause chain check
src/judge.ts          deterministic verdict
src/critic.ts         independent reviewer
src/fix.ts            fix check
src/bundle.ts         bundle.json and report.md
src/llm/nightshift.ts Nightshift client: Nemotron only, receipts, retries
src/engines/          Meterless World Model integration
src/replay.ts         recordings
```

## Publishing note

`npx domino-check` resolves from the npm registry, so it works for other people once the package is published (`npm login`, then `npm publish` in `agent/`; the name `domino-check` is free as of 27 Oct 2026). Until then, `npm link` in `agent/` gives the same `domino-check` and `domino` commands on your machine. Never write `npx domino`: an unrelated package already has that name.
