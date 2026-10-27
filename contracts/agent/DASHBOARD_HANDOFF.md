# Dashboard hand-off: live PR checks and every backend output (P5–P7)

From Abhi's agent session, 27 Oct 2026. The plan with all phase cards: https://claude.ai/artifact/3D1eZz4Qqm82ndyhRSxs5T (ask Abhi for access).
The agent side (P1–P4) is done on `abhijandyala` (a8e4a16 and the commit after it). Live proof: PRs #1–#3 on https://github.com/abhijandyala/domino-demo-shop were checked by `domino watch --post`; their runs are in `agent/runs/live/`. Contract: `contracts/agent/types.ts`, now `CONTRACT_VERSION 0.2.0` (additive only; nothing removed or renamed).

## What the agent now produces

**The runs folder.** `domino dashboard` starts `ui` with `npm run dev -- --port <p> --strictPort` and `DOMINO_RUNS_DIR=<agent>/runs/live`. That folder holds:

| Path | What | Written |
|---|---|---|
| `run-*/trace.jsonl` | One event per line, appended as the run happens | Live, from the first event |
| `run-*/summary.json`, `bundle.json`, `report.md`, `cassette.json` | Run results; `report.md` is the PR comment for that run | At the end of a run |
| `receipts.jsonl` | Nightshift receipt per model call (receiptId, cacheStatus, requestedModel…) | Live |
| `watch-<owner>-<repo>.json` | Watcher state (shape below) | Whenever the queue changes |
| `pr-<owner>-<repo>-<n>-<sha7>.md` | The full comment posted (or, without `--post`, that would have been posted) | End of a PR check |

Replays (`domino replay`/`demo`) now write to `agent/runs/replay/`, not the live folder.

**New and previously ignored fields** (see `types.ts`):
- `run_started.change.source?: ChangeSource`: `{kind: "pull_request", repo, number, url, title, head_sha, folder}`. Present when a pull request triggered the run; absent for manual and batch runs.
- `verdict.cause_chain?: Array<{claim, cites: string[]}>`: the cited cause (P1/P2). Already in the trace since 53abc68.
- `verdict.fix_verification?: FixVerification`: `{status: "verified"|"failed"|"untested"|"not_applicable", overrides, experiments, reasons, rounds}`. In the trace since 0dc2c4f; the UI ignores it today.
- `bundle.cause_chain`: hops with each cite resolved: `cites: [{cite, refs: [{ref, kind: "row"|"experiment", facts}]}]`.
- `bundle.cause_chain_check`: `"passed" | "failed" | "absent"`.
- `bundle.change.source`: same as above, or `null`.
- `bundle.experiments[].fix_overrides`: non-null on fix-check runs.
- `fix_verification.trim` (contract 0.3.0, P4): `{proposed, not_needed, alternatives, kinds, experiments}`. After a fix holds, code tries each override; `fix_verification.overrides` is then only the needed set. `kinds[target]` is judged on the metrics some override can move (the change's own direct effect is left out): `removes_cause` (they all return to baseline), `adds_headroom` (the checks pass while some stay moved) or `undetermined`. Show the kept set, "not needed" and "also fixes it alone".

**Watcher state** (`watch-*.json`):
```json
{ "repo": "abhijandyala/domino-demo-shop", "updated_at": "…",
  "current": { "number": 1, "head_sha": "255dfe7…", "started_at": "…" },
  "queue": [ { "number": 2, "head_sha": "…", "title": "…" } ],
  "checked": { "1@255dfe7…": { "at": "…", "verdicts": ["reproduced_failure"], "run_ids": ["run-…"], "skipped": "draft" } } }
```

## P5: Live and Recorded

1. Console gets two tabs. **Live**: runs from `DOMINO_RUNS_DIR` (`from: 'runs'`), including running ones. **Recorded**: the bundled `samples/` batches (works on the static build too).
2. A provenance chip on every run: Live · running / Live · finished / Recorded · batch 53abc68 / Replay.
3. Never show `● Live` when any event has `replay: true` (CLAUDE.md §4). `CheckPlayer` and the sidebar count ignore `inv.replay` today.
4. Stale: no `run_finished` and the trace's mtime older than 11 minutes means *Stopped*, not running. The agent's hard limit is 10 minutes.
5. `vite.config.ts` API: add `report.md` to `RUN_FILES`; serve root-level `receipts.jsonl` and `watch-*.json` from the runs folder; give the console the samples' `manifest.json`, `scorecard.json` and `zetaris.json`; dedupe by run id, not by path.
6. Empty states: "Not connected: run `domino dashboard`" / "Connected, no runs yet" / "Watching owner/repo · N queued" (from `watch-*.json`).
7. Trigger label: "Pull request #n" only when `change.source` exists. Manual runs currently show "Pull request opened" in Live check.
8. Landing-page report links go to Recorded cases with the manifest's case ids.

## P6: show every backend output

In this order; the first two make the dashboard say something wrong today.
1. **Fix check.** Render `fix_verification` (status, overrides, fix experiments, reasons, rounds). Stop calling every mitigation "not tested": in the 53abc68 batch, 14 of 18 breaking runs had a fix that held when re-run. Label fix-check experiments (`fix_overrides` non-null) as fix checks. The wording test bans "verified", so write "fix held when re-run" / "fix did not hold".
2. **Cited cause chain.** Hops in the Summary; each cite opens the evidence drawer with `refs[].facts`; show whether `cause_chain_check` passed.
3. **Zetaris queries.** SQL, row count, elapsed ms, snapshot flag (`usl_query.result`).
4. **Receipts.** Receipt id, cache status, requested vs routed model, Nemotron share per run.
5. **Review rounds.** All `review` events (sent_back → revised → approved/flagged), not only the last.
6. Hypothesis revision history; `summary.model_failures`, `cache_hits`, `model_prediction` vs verdict.
7. World Model tile counts reads + writes + updates: relabel it.
8. `#/docs/cli`: the real commands (below). The project switcher shows the watched repo.
9. PR tab: show the run's real `report.md`, plus "Posted to PR #n" with the link when `change.source` exists.

## P7: recorded data

- Replace `samples/runs/` (30 runs, ab140d5) with the 39 runs in `agent/runs/final-full-53abc68/full-*/run-*`. Flatten them and skip `network-damaged/`. Their bundles were rebuilt with `cause_chain` on 27 Oct (34 passed, 5 failed the check; traces and verdicts unchanged).
- `samples/manifest.json`: add w-c5h2, w-f8w3, w-v2k9 with neutral labels.
- Anish, after grading: `python3 scorecard/export_site.py --out samples --manifest samples/manifest.json` (never `--include-answers` inside the repo).

## Commands (for the docs page)

```
cd agent && npm install && npm link          # once; then `domino` (or `domino-check`) works anywhere
domino doctor                                 # Node, Python, data layer + read-only Zetaris login, Nightshift + a real Nemotron call, gh
domino run --change <world-id>                # one live investigation into agent/runs/live
domino dashboard [--port 5173] [--open]       # the dashboard, watching agent/runs/live
domino pr <n> --repo owner/name [--post]      # check one pull request
domino watch --repo owner/name [--post]       # check every new commit on every open pull request
domino replay <cassette.json> · domino demo   # replay recordings, no keys or services
```
Exit codes: 0 finished · 1 failure reproduced (with `--fail-on-break`) · 2 error · 3 outage or inconclusive. Without `--post`, nothing reaches GitHub. Bare `npx domino` downloads an unrelated npm package, so don't document it.
