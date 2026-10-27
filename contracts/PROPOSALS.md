# Proposals for the agent (Anish → Abhi)

Ideas from the 26 Oct scorecard, for Abhi to take or leave. They need nothing new from the data layer:
everything they use is already in the v0.3 contract ([README.md](README.md)). Same logic for every world,
no world-specific rules or hints.

**Why:** in full mode on ab140d5 the verdicts are always right, but the cause is named far less often than the
verdict is. Full and no_usl name the cause about as often on failing cases, so the cross-source chain from
`dependency_path` is being used to find failures but not yet to explain them.

## P1. Write the cause as cited hops
Write the cause as an ordered chain from the change to the failing check, one hop per link:

```json
{"cause_chain": [
  {"claim": "the change alters X", "cites": ["<path hop: from -> to, relation>"]},
  {"claim": "component B reads X",  "cites": ["<path hop>", "<lookup row_id>"]},
  {"claim": "B's setting S is exceeded", "cites": ["<experiment_id>: metric b.m baseline=…, candidate=…"]},
  {"claim": "so assertion A fails", "cites": ["<experiment_id>: assertion A"]}
]}
```

- Every hop cites at least one `dependency_path` hop, `lookup` row id or `experiment_id` + metric.
- Code, not the model, rejects a chain with an uncited hop or a cite that wasn't returned in this run,
  and asks the investigator once to repair it. The prose `cause_claim` is then written from the chain.
- The chain must end at the assertion that failed and start at the change's `entity_id`.

## P2. Explain safe changes from the chain too
For a change with no reproduced failure, say where the chain stops: which components the change reaches,
which settings they read, and the metric that stayed within bounds (baseline vs candidate). The same
citation rule applies. "Nothing failed" alone isn't an explanation.

## P3. Confirm the mechanism with one setting
After a reproduced failure and before writing the fix, pick the `overridable` setting the chain points at
and run the candidate with it moved once each way (`params.overrides`). The cause is confirmed when the
outcome flips the way the chain predicts. That run is a fix candidate for `judgeFix` (§5 of the agent
contract), so it costs nothing extra. Runs take about 0.25 s each.

## Measuring it
Anish re-runs the scorecard on the practice worlds after any change (modes D and E, 3 repeats). The
held-out world stays out of tuning: its results are only used for the final run.
