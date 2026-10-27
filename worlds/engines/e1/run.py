"""Engine e1: metadata store -> bundle-builder -> worker-runtime, each a separate process.

    python3 run.py --case <case.json> --variant baseline|candidate|control [--params JSON]

baseline  = base grants only
candidate = base grants + the case's change
control   = base grants + the change + its revert
Prints one JSON result line (see data_layer/experiments.py for the shape).
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import catalog  # noqa: E402

STEP_TIMEOUT_S = 20
ACCEPTED_PARAMS: dict = {"overrides": "settings to change before the run, as {target: value}"}

# Settings a fix may change, named as the semantic layer names them (runtime_config / job_definitions).
_SETTINGS = [
    {"target": "worker-runtime.max_entries", "type": "number", "description": "worker-runtime setting",
     "get": lambda s: s["runtime"]["max_entries"], "set": lambda s, v: s["runtime"].__setitem__("max_entries", v)},
    {"target": "worker-runtime.startup_timeout_s", "type": "number", "description": "worker-runtime setting",
     "get": lambda s: s["runtime"].get("startup_timeout_s", 30),
     "set": lambda s, v: s["runtime"].__setitem__("startup_timeout_s", v)},
    {"target": "bundle-builder.output_mode", "type": "string", "choices": ["as_returned", "collapse_same_name"],
     "description": "bundle-builder setting: as_returned or collapse_same_name",
     "get": lambda s: "collapse_same_name" if s["builder"].get("collapse_same_name") else "as_returned",
     "set": lambda s, v: s["builder"].__setitem__("collapse_same_name", v == "collapse_same_name")},
]


def overridable(setup: dict) -> list:
    """What `describe` lists as changeable, with each setting's current value."""
    return [{"target": s["target"], "current": s["get"](setup), "type": s["type"], "description": s["description"]}
            for s in _SETTINGS]


def apply_overrides(setup: dict, overrides) -> tuple:
    """(a copy of setup with every override applied, log lines) or (None, reason). Never a silent no-op."""
    if not isinstance(overrides, dict):
        return None, "overrides must be an object of target -> value"
    by_target = {s["target"]: s for s in _SETTINGS}
    out, applied = copy.deepcopy(setup), []
    for raw, value in overrides.items():
        target = str(raw).split("/setting/")[-1]
        spec = by_target.get(target)
        if spec is None:
            return None, f"unknown override target {raw!r}; overridable: {sorted(by_target)}"
        kind = spec["type"]
        if ((kind == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))))
                or (kind == "boolean" and not isinstance(value, bool))
                or (kind == "string" and value not in spec.get("choices", [value]))):
            return None, f"override {target} must be {spec.get('choices') or 'a ' + kind}, got {value!r}"
        spec["set"](out, value)
        applied.append(f"harness: applied override {target} = {json.dumps(value)}")
    return out, applied


def _step(name: str, args: list) -> tuple:
    proc = subprocess.run([sys.executable, "-E", "-s", str(HERE / f"{name}.py"), *args],
                          capture_output=True, text=True, timeout=STEP_TIMEOUT_S)
    try:
        summary = json.loads(proc.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError):
        summary = {}
    return proc.returncode, summary, [line for line in proc.stderr.splitlines() if line.strip()]


def run(setup: dict, variant: str, params: dict) -> dict:
    unknown = sorted(set(params) - set(ACCEPTED_PARAMS))
    if unknown:
        return {"error": f"unsupported params: {unknown}"}
    setup, override_logs = apply_overrides(setup, params.get("overrides") or {})
    if setup is None:
        return {"error": override_logs}
    migrations = [setup["base_sql"]]
    if variant in ("candidate", "control"):
        migrations.append(setup["change_sql"])
    if variant == "control":
        migrations.append(setup["revert_sql"])
    input_sha = hashlib.sha256(json.dumps({"setup": setup, "variant": variant, "params": params},
                                          sort_keys=True).encode()).hexdigest()

    with tempfile.TemporaryDirectory(prefix="e1-") as tmp:
        work = Path(tmp)
        db, bundle, config = work / "catalog.sqlite", work / "bundle.json", work / "runtime.json"
        catalog.init(str(db), setup["databases"], setup["table"], setup["n_columns"], setup["types"])
        logs = list(override_logs)
        for sql in migrations:
            for statement in catalog.apply_migration(str(db), sql):
                logs.append(f"meta-store: applied {statement}")
        config.write_text(json.dumps(setup["runtime"]), encoding="utf-8")

        builder_args = ["--catalog", str(db), "--principal", setup["principal"], "--table", setup["table"],
                        "--out", str(bundle)]
        if setup["builder"].get("collapse_same_name"):
            builder_args.append("--collapse-same-name")
        b_code, b_out, b_log = _step("builder", builder_args)
        logs += [f"bundle-builder: {line}" for line in b_log]

        if b_code == 0:
            l_code, l_out, l_log = _step("loader", ["--bundle", str(bundle), "--config", str(config)])
            logs += [f"worker-runtime: {line}" for line in l_log]
        else:
            l_code, l_out = None, {}

    assertions = [
        {"name": "builder_completes", "passed": b_code == 0, "observed": f"exit {b_code}", "expected": "exit 0"},
        {"name": "runtime_starts_with_bundle", "passed": l_code == 0,
         "observed": "not run" if l_code is None else f"exit {l_code}", "expected": "exit 0"},
    ]
    return {
        "passed": all(a["passed"] for a in assertions),
        "assertions": assertions,
        "metrics": {
            "meta-store.rows_visible_to_builder": b_out.get("visible_rows"),
            "bundle-builder.entries": b_out.get("entries"),
            "bundle-builder.bundle_bytes": b_out.get("bytes"),
            "worker-runtime.exit_code": l_code,
            "worker-runtime.loaded_entries": l_out.get("loaded_entries"),
        },
        "artifacts": [{"name": "bundle.json", "sha256": b_out.get("sha256"), "bytes": b_out.get("bytes")}],
        "logs": logs,
        "input_sha256": input_sha,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", required=True)
    parser.add_argument("--variant", choices=("baseline", "candidate", "control"))
    parser.add_argument("--params", default="{}")
    parser.add_argument("--overridable", action="store_true", help="print the settings a fix may change")
    args = parser.parse_args()
    setup = json.loads(Path(args.case).read_text(encoding="utf-8"))["setup"]
    if args.overridable:
        print(json.dumps(overridable(setup)))
    elif not args.variant:
        parser.error("--variant is required")
    else:
        print(json.dumps(run(setup, args.variant, json.loads(args.params))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
