"""Engine e3: template-registry, rule-validator, content-pipeline and content-interpreter.

    python3 run.py --case <case.json> --variant baseline|candidate|control [--params JSON]

baseline  = existing rules only
candidate = existing rules + the change's new rule
control   = the change applied, then reverted (existing rules only)
The pipeline validates the rule set (its own process); if validation passes it ships the rules,
then the interpreter (its own process) evaluates them against a stream of events.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rules as rule_files  # noqa: E402

STEP_TIMEOUT_S = 20
ACCEPTED_PARAMS: dict = {}


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
    rules = list(setup["existing_rules"]) + ([setup["new_rule"]] if variant == "candidate" else [])
    input_sha = hashlib.sha256(json.dumps({"setup": setup, "variant": variant, "params": params},
                                          sort_keys=True).encode()).hexdigest()
    with tempfile.TemporaryDirectory(prefix="e3-") as tmp:
        work = Path(tmp)
        staged, shipped, templates = work / "staged", work / "shipped", work / "templates.json"
        templates.write_text(json.dumps(setup["templates"]), encoding="utf-8")
        rule_files.write_rules(staged, rules)
        logs = []
        v_args = ["--rules", str(staged), "--templates", str(templates)]
        if setup["validator_checks_consumer"]:
            v_args += ["--consumer-inputs", str(setup["consumer_inputs"])]
        v_code, v_out, v_log = _step("validator", v_args)
        logs += [f"rule-validator: {line}" for line in v_log]
        # The pipeline ships only a fully valid rule set; otherwise the previous set stays in place.
        rule_files.write_rules(shipped, rules if v_code == 0 else list(setup["existing_rules"]))
        logs.append(f"content-pipeline: shipped {len(rule_files.read_rules(shipped))} rule(s)"
                    + ("" if v_code == 0 else "; new rule set held back by validation"))
        i_code, i_out, i_log = _step("interpreter", ["--rules", str(shipped), "--inputs", str(setup["consumer_inputs"])])
        logs += [f"content-interpreter: {line}" for line in i_log]
        bundle = json.dumps(rule_files.read_rules(shipped), sort_keys=True).encode()

    assertions = [
        {"name": "validator_runs", "passed": v_code in (0, 1), "observed": f"exit {v_code}", "expected": "exit 0 or 1"},
        {"name": "interpreter_keeps_running", "passed": i_code == 0, "observed": f"exit {i_code}", "expected": "exit 0"},
    ]
    return {
        "passed": all(a["passed"] for a in assertions),
        "assertions": assertions,
        "metrics": {
            "rule-validator.rules_checked": v_out.get("checked"),
            "rule-validator.rules_rejected": len(v_out.get("rejected", [])),
            "content-pipeline.rules_shipped": len(json.loads(bundle)),
            "content-interpreter.events_processed": i_out.get("events_processed"),
            "content-interpreter.matches": i_out.get("matches"),
            "content-interpreter.exit_code": i_code,
        },
        "artifacts": [{"name": "shipped_rules.json", "sha256": hashlib.sha256(bundle).hexdigest(), "bytes": len(bundle)}],
        "logs": logs,
        "input_sha256": input_sha,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", required=True)
    parser.add_argument("--variant", required=True, choices=("baseline", "candidate", "control"))
    parser.add_argument("--params", default="{}")
    args = parser.parse_args()
    setup = json.loads(Path(args.case).read_text(encoding="utf-8"))["setup"]
    print(json.dumps(run(setup, args.variant, json.loads(args.params))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
