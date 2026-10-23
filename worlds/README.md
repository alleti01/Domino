# Test worlds (Person 1)

Small, offline, deterministic systems that really break when a specific change is applied.
Each world is `worlds/<world_id>/` with `describe.json` (neutral, no hints) and `world.py`
(prints one JSON result). It runs through `data_layer.run_experiment`. See `data_layer/experiments.py`.

Rules: neutral IDs and component names; no root cause, failure family or expected verdict anywhere
in this folder. Those live in `ground_truth/` only. Synthetic data only.
