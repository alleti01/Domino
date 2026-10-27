"""Engine e2: tenant-registry, cleanup-job and lifecycle-api. The cleanup job runs as its own process.

    python3 run.py --case <case.json> --variant baseline|candidate|control [--params JSON]

baseline  = system without the change (the job is not run)
candidate = the change applied: the job runs over the change's ID list
control   = the change applied, then reverted: the ID list is removed, the job runs over nothing
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
import registry  # noqa: E402

STEP_TIMEOUT_S = 20
ACCEPTED_PARAMS: dict = {"overrides": "settings to change before the run, as {target: value}"}

# Settings a fix may change, named as the semantic layer names them.
_SETTINGS = [
    {"target": "cleanup-job.mode", "type": "string", "choices": ["permanent", "mark"],
     "description": "cleanup-job setting: permanent or mark",
     "get": lambda s: s["mode"], "set": lambda s, v: s.__setitem__("mode", v)},
]


def overridable(setup: dict) -> list:
    """What `describe` lists as changeable, with each setting's current value."""
    return [{"target": s["target"], "current": s["get"](setup), "type": s["type"], "description": s["description"],
             **({"choices": list(s["choices"])} if "choices" in s else {})}
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


def run(setup: dict, variant: str, params: dict) -> dict:
    unknown = sorted(set(params) - set(ACCEPTED_PARAMS))
    if unknown:
        return {"error": f"unsupported params: {unknown}"}
    setup, override_logs = apply_overrides(setup, params.get("overrides") or {})
    if setup is None:
        return {"error": override_logs}
    input_sha = hashlib.sha256(json.dumps({"setup": setup, "variant": variant, "params": params},
                                          sort_keys=True).encode()).hexdigest()
    targets = setup["targets"] if variant == "candidate" else []
    with tempfile.TemporaryDirectory(prefix="e2-") as tmp:
        work = Path(tmp)
        db, target_file = work / "registry.sqlite", work / "targets.csv"
        registry.init(str(db), setup["records"])
        before = registry.snapshot(str(db))
        logs, code, summary = list(override_logs), None, {"processed": 0, "not_found": 0, "removed": []}
        if variant != "baseline":
            target_file.write_text("record_id\n" + "".join(f"{t}\n" for t in targets), encoding="utf-8")
            proc = subprocess.run([sys.executable, "-E", "-s", str(HERE / "cleanup.py"), "--registry", str(db),
                                   "--targets", str(target_file), "--mode", setup["mode"]],
                                  capture_output=True, text=True, timeout=STEP_TIMEOUT_S)
            code = proc.returncode
            logs += [f"cleanup-job: {line}" for line in proc.stderr.splitlines() if line.strip()]
            try:
                summary = json.loads(proc.stdout.strip().splitlines()[-1])
            except (IndexError, json.JSONDecodeError):
                pass
        after = registry.snapshot(str(db))
        state = json.dumps(after, sort_keys=True).encode()

    gone = [r for r in before if r not in after or after[r]["status"] != before[r]["status"]]
    listed = set(targets)
    unlisted = [r for r in gone if r not in listed]
    assertions = [
        {"name": "job_completes", "passed": code in (None, 0),
         "observed": "not run" if code is None else f"exit {code}", "expected": "exit 0"},
        {"name": "only_listed_records_removed", "passed": not unlisted,
         "observed": f"{len(unlisted)} unlisted record(s) removed", "expected": "0 unlisted records removed"},
    ]
    return {
        "passed": all(a["passed"] for a in assertions),
        "assertions": assertions,
        "metrics": {
            "tenant-registry.records_before": len(before),
            "tenant-registry.records_after": len(after),
            "cleanup-job.ids_processed": summary["processed"],
            "cleanup-job.ids_not_found": summary["not_found"],
            "tenant-registry.removed_listed": len([r for r in gone if r in listed]),
            "tenant-registry.removed_unlisted": len(unlisted),
            "tenant-registry.removed_sites": len([r for r in gone if before[r]["kind"] == "site"]),
            "tenant-registry.removed_apps": len([r for r in gone if before[r]["kind"].startswith("app:")]),
        },
        "artifacts": [{"name": "registry_after.json", "sha256": hashlib.sha256(state).hexdigest(), "bytes": len(state)}],
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
