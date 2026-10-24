"""Regenerates contracts/samples/ from REAL outputs, so fake mode returns exactly the shapes live mode does.

Every sample comes from the real code path:
  - success samples: world w-k7m2 run offline, and Zetaris results replayed from zetaris/snapshots/
  - error samples: a refused statement, an unreachable Zetaris, a sample-mode miss, a world timeout
The world ID is relabelled to `fake-w0`, `mode` is set to "fake" and a `_note` is added.
No Zetaris or credentials are needed.

    python3 contracts/make_samples.py           rewrite the samples
    python3 contracts/make_samples.py --check   exit 1 if any sample's shape no longer matches the real output
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_layer import config, experiments, lookups  # noqa: E402

SAMPLES = Path(__file__).resolve().parent / "samples"
WORLD, FAKE_WORLD = "w-k7m2", "fake-w0"
LOOKUP_SQL = ("SELECT job_id, service_name, principal_id, query_id, output_mode, source_system, source_row_id "
              f"FROM lightning.metastore.domino.systems.job WHERE system_id = '{WORLD}' ORDER BY job_id")
NOTE = ("FAKE SAMPLE: a real output captured from the data layer with the world relabelled. Same shape as live. "
        "The scorecard rejects mode=fake.")


def _relabel(value):
    if isinstance(value, dict):
        return {k: _relabel(v) for k, v in value.items() if k != "snapshot_request"}
    if isinstance(value, list):
        return [_relabel(v) for v in value]
    if isinstance(value, str):
        return value.replace(WORLD, FAKE_WORLD)
    return value


def _fake(result: dict) -> dict:
    return {**_relabel(result), "mode": "fake", "_note": NOTE}


def _with_env(overrides: dict, fn):
    saved = {k: os.environ.get(k) for k in overrides}
    os.environ.update(overrides)
    lookups._agent = None
    try:
        return fn()
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        lookups._agent = None


def build() -> dict:
    config.load_env()
    out = {}
    for variant in experiments.VARIANTS:
        out[f"run_experiment_{variant}.json"] = _fake(experiments.run_experiment(WORLD, variant))
    out["run_experiment_timeout.json"] = _fake(experiments.run_experiment(WORLD, "candidate", timeout_s=0.001))
    out["describe_world.json"] = _fake(experiments.describe_world(WORLD))

    sample = {"DOMINO_DATA_MODE": "sample"}
    out["lookup.json"] = _fake(_with_env(sample, lambda: lookups.lookup(LOOKUP_SQL)))
    out["dependency_path.json"] = _fake(_with_env(sample, lambda: lookups.dependency_path(f"{WORLD}/change/0042")))
    out["lookup_not_in_sample.json"] = _fake(_with_env(sample, lambda: lookups.lookup("SELECT 1 AS not_recorded")))

    # Nothing listens on port 9, and no real credentials are sent anywhere.
    offline = {"DOMINO_DATA_MODE": "live", "ZETARIS_BASE_URL": "http://127.0.0.1:9", "ZETARIS_ORG_ID": "1",
               "ZETARIS_AGENT_USERNAME": "sample-agent", "ZETARIS_AGENT_PASSWORD": "not-a-real-password",
               "DOMINO_QUERY_LOG": os.devnull}
    out["lookup_unavailable.json"] = _fake(_with_env(offline, lambda: lookups.lookup(LOOKUP_SQL)))
    out["lookup_error.json"] = _fake(_with_env(offline, lambda: lookups.lookup("DELETE FROM some_table")))
    for name, body in out.items():
        if body.get("status") is None:
            raise SystemExit(f"{name}: no status in captured output")
    return out


def shape(value):
    """Keys and value types, recursively; lists are described by their first element."""
    if isinstance(value, dict):
        return {k: shape(v) for k, v in sorted(value.items()) if k != "_note"}
    if isinstance(value, list):
        return [shape(value[0])] if value else []
    return type(value).__name__


def main() -> int:
    fresh = build()
    if "--check" in sys.argv:
        drift = []
        for name, body in fresh.items():
            path = SAMPLES / name
            if not path.is_file():
                drift.append(f"{name}: missing")
            elif shape(json.loads(path.read_text(encoding="utf-8"))) != shape(body):
                drift.append(f"{name}: shape differs from the real output")
        print("\n".join(drift) if drift else f"All {len(fresh)} samples match the real output shapes.")
        return 1 if drift else 0
    SAMPLES.mkdir(exist_ok=True)
    for old in SAMPLES.glob("*.json"):
        if old.name not in fresh:
            old.unlink()
    for name, body in sorted(fresh.items()):
        (SAMPLES / name).write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
        print(f"{name}: status={body['status']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
