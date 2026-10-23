# Test worlds (Person 1)

Small, offline, deterministic systems that really break when a specific change is applied.
They run through `data_layer.run_experiment(world, variant, params)`.

```
worlds/
├── engines/<engine>/   the cooperating programs plus run.py, which runs one variant and prints a JSON result
└── cases/<world_id>.json
        engine     which engine runs it
        describe   what the agent may see: components, the change (PR diff), params, metrics
        setup      private structural parameters, passed only to the engine
```

Variants: `baseline` (without the change), `candidate` (with it), `control` (applied, then reverted).

```bash
python3 -m data_layer worlds
python3 -m data_layer describe <world_id>
python3 -m data_layer run <world_id> candidate
python3 scorecard/leakage_check.py
```

Case files for engine `e1` are generated: edit `engines/e1/make_cases.py`, then run it.

**Rules:**
- Use neutral IDs and component names.
- Never put a root cause, failure family or expected verdict in a `describe` block, a log line, a metric name or a file path.
- Labels live in the private folder (`$DOMINO_PRIVATE_DIR/ground_truth/`, outside the repo). Held-out worlds go in `$DOMINO_PRIVATE_DIR/worlds/cases/`, and their engines in `.../worlds/engines/`. `run_experiment` finds them there; `zetaris/build_sources.py` keeps their rows out of the repo CSVs.
- `scorecard/leakage_check.py` must pass before any commit.
- Synthetic data only.
