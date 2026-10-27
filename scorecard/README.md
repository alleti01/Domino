# Scorecard (Person 1)

Measures Domino honestly on the labelled cases. Labels (expected verdicts, causal chains, cause markers)
are read only from `$DOMINO_PRIVATE_DIR/ground_truth/` (default `~/domino-private`), never the repo.

```bash
python3 scorecard/run_scorecard.py
```
```bash
python3 scorecard/run_scorecard.py --import <agent run-worlds folder> [--import ...]
```
```bash
python3 scorecard/run_scorecard.py --agent-cmd "<agent command with {world} and {mode}>" --repeats 2
```
`--import` grades the agent's own batch results (`agent/scripts/run-worlds.ts`, folders named `<mode>-<stamp>`), so the model token never has to be on this machine.
Modes B and C run no experiments, so they're graded on the model's own `prediction` (breaks / safe / unsure), and their warnings are never counted as backed. D and E are graded on the judge's verdict, which only says "reproduced" after baseline pass, two matching candidate failures and a passing control.

| Mode | What it is |
|---|---|
| A | static checks on the diff only (`mode_a.py`) |
| X | experiments only: presses "run" and reads pass/fail, no evidence, no model |
| R | reference script (`reference_investigator.py`), model-free, written for World 1 |
| B / C / D / E | the agent: no tools / context without experiments / full / full with the USL hidden |

## Metrics
Reported per mode, and separately for the practice worlds (1 and 2) and the held-out world (3):
- correct
- failures caught
- false alarms on safe cases
- inconclusive
- **explained cause**: the share of the true mechanism's key facts the explanation names. The facts are mechanism only (why it breaks, from the cross-source evidence), never symptoms an experiment log prints. It's keyword-based, so treat it as a proxy.
- warnings backed by a reproduced failure
- average time
- average model calls
- cache hits (should be 0, which shows repeated runs were really independent)
- errors (agent crashes or unreadable output, which **count as wrong**)
- unavailable (outages and the 10-minute budget, **excluded** from accuracy)

## Before each batch
Zetaris gets a health check in live mode. The agent reports model-provider outages itself (`outage` in its summary).

## Repeats
`--repeats N` runs the agent modes N times and reports whether verdicts agree. The scorecard checks that the repeats really are separate runs:
- The first run of each case always counts.
- A repeat counts only if its summary shows **0 cache hits** and a **new `run_id`**.
- A repeat with unknown cache status, any cache hit, or a reused run_id is left out of every number. Its reason is saved in `results.json`, and the line shows "repeats left out".
- Each mode prints `independent runs per case: n = …`. Report that n, not the number of times you ran it.

Results go to `runs/scorecard/<timestamp>/results.json` (gitignored).

## Other tools here
- `leakage_check.py`: nothing the agent can see gives answers away; guards the repo
- `pre_push_hook.sh`: blocks pushes that would carry answers
- `backup_private.sh`: encrypted backup of the private folder to iCloud Drive
- `score.py`: shared scoring
- `repo_scan.py`: before submitting, scans every branch's history for big files, secrets and personal data
- `export_site.py`: writes the dashboard's `zetaris.json` and `scorecard.json` (formats in the dashboard's `docs/data-formats.md`). By default it writes totals only, never per-case answers; use `--include-answers` only at the freeze
