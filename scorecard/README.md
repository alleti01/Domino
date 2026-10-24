# Scorecard (Person 1)

Measures Domino honestly on the labelled cases. Labels (expected verdicts, causal chains, cause markers)
are read only from `$DOMINO_PRIVATE_DIR/ground_truth/` (default `~/domino-private`), never the repo.

```bash
python3 scorecard/run_scorecard.py
```
```bash
python3 scorecard/run_scorecard.py --agent-cmd "<agent command with {world} and {mode}>" --repeats 2
```

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
- errors (agent crashes or unreadable output, which **count as wrong**)
- unavailable (outages and the 10-minute budget, **excluded** from accuracy)

## Before each batch
Zetaris gets a health check in live mode. The agent reports model-provider outages itself (`outage` in its summary).

## Repeats
`--repeats N` runs the agent modes N times and reports whether verdicts agree. Confirm in the model receipts that repeats weren't served from a cache; otherwise report n = 1.

Results go to `runs/scorecard/<timestamp>/results.json` (gitignored).

## Other tools here
- `leakage_check.py`: nothing the agent can see gives answers away; guards the repo
- `pre_push_hook.sh`: blocks pushes that would carry answers
- `backup_private.sh`: encrypted backup of the private folder to iCloud Drive
- `score.py`: shared scoring
