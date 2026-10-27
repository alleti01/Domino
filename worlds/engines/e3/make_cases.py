"""Writes the e3 case files into worlds/cases/. Re-run after editing CASES.

Only structural parameters live here. What each case is expected to do lives in the private ground truth.
"""

from __future__ import annotations

import json
from pathlib import Path

CASES_DIR = Path(__file__).resolve().parents[2] / "cases"
CHANGE = "0291"

# case_id: template, fields it declares, inputs the interpreter supplies, fields the new rule matches on,
# and whether the validator also checks against the interpreter's input count
CASES = {
    "w-x3c9": {"template": "T7", "declared": 21, "inputs": 20, "new_fields": ["f02", "f21"], "validator_checks_consumer": False},
    "w-n7v2": {"template": "T7", "declared": 21, "inputs": 20, "new_fields": ["f02", "f05"], "validator_checks_consumer": False},
    "w-g4k8": {"template": "T4", "declared": 13, "inputs": 12, "new_fields": ["f01", "f13"], "validator_checks_consumer": False},
    "w-r1z5": {"template": "T7", "declared": 21, "inputs": 21, "new_fields": ["f02", "f21"], "validator_checks_consumer": False},
    "w-y6p3": {"template": "T7", "declared": 21, "inputs": 20, "new_fields": ["f02", "f21"], "validator_checks_consumer": True},
}
EXISTING = [("rule-0280", ["f02", "f05"]), ("rule-0281", ["f01", "f03"]), ("rule-0282", ["f04", "f07", "f09"])]


def _rule(rule_id: str, template: str, fields: list) -> dict:
    return {"rule_id": rule_id, "template": template, "criteria": {f: f"m-{rule_id[-4:]}-{f}" for f in fields}}


def build(case_id: str, spec: dict) -> dict:
    t = spec["template"]
    new_rule = _rule(f"rule-{CHANGE}", t, spec["new_fields"])
    path = f"content/rules/{t}/rule-{CHANGE}.json"
    body = json.dumps(new_rule, indent=2, sort_keys=True).splitlines()
    diff = f"--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{len(body)} @@\n" + "".join(f"+{line}\n" for line in body)
    return {
        "engine": "e3",
        "describe": {
            "title": f"Content update: rule {CHANGE} for template {t}",
            "components": [
                {"name": "template-registry", "role": "defines template types and their fields"},
                {"name": "rule-validator", "role": "checks rule files before they ship"},
                {"name": "content-pipeline", "role": "validates rule files, then ships them to the interpreter"},
                {"name": "content-interpreter", "role": "evaluates shipped rules against incoming events"},
            ],
            "change": {
                "entity_id": f"{case_id}/change/{CHANGE}",
                "title": f"Content update: rule {CHANGE} for template {t}",
                "description": f"Adds one rule for template type {t}. Passed validation in CI.",
                "files": [path],
                "diff": diff,
            },
            "variants": {
                "baseline": "system without the change (existing rules only)",
                "candidate": "system with the change applied (existing rules plus the new rule)",
                "control": "change applied, then reverted (existing rules only)",
            },
            "params": {},
            "metrics": ["rule-validator.rules_checked", "rule-validator.rules_rejected", "content-pipeline.rules_shipped",
                        "content-interpreter.events_processed", "content-interpreter.matches",
                        "content-interpreter.exit_code"],
        },
        "setup": {
            "templates": {t: {"field_count": spec["declared"]}},
            "consumer_inputs": spec["inputs"],
            "existing_rules": [_rule(rid, t, fields) for rid, fields in EXISTING],
            "new_rule": new_rule,
            "validator_checks_consumer": spec["validator_checks_consumer"],
            "change_id": CHANGE,
            "file": path,
        },
    }


if __name__ == "__main__":
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    for case_id, spec in CASES.items():
        (CASES_DIR / f"{case_id}.json").write_text(json.dumps(build(case_id, spec), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(CASES)} cases to {CASES_DIR}")
