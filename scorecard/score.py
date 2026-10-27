"""Scores predictions against the private ground truth. Shared by every scorecard mode.

A prediction per world: {"verdict": "reproduced_failure" | "no_failure_observed" | "inconclusive", ...}.
"reproduced_failure" counts as a warning. Labels come only from DOMINO_PRIVATE_DIR (never the repo).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_layer import config  # noqa: E402

WARN = "reproduced_failure"


def labels() -> Dict[str, dict]:
    path = config.private_dir() / "ground_truth" / "cases.json"
    if not path.is_file():
        raise SystemExit(f"No ground truth at {path}. Scoring only runs on the machine that holds the private folder.")
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


def score(predictions: Dict[str, dict]) -> dict:
    truth = labels()
    failing = [w for w, t in truth.items() if t["expected_verdict"] == WARN]
    safe = [w for w, t in truth.items() if t["expected_verdict"] != WARN]
    caught = [w for w in failing if predictions.get(w, {}).get("verdict") == WARN]
    false_alarms = [w for w in safe if predictions.get(w, {}).get("verdict") == WARN]
    inconclusive = [w for w in truth if predictions.get(w, {}).get("verdict") == "inconclusive"]
    correct = [w for w in truth if predictions.get(w, {}).get("verdict") == truth[w]["expected_verdict"]]
    return {
        "cases": len(truth), "correct": len(correct),
        "failing_cases": len(failing), "caught": len(caught),
        "safe_cases": len(safe), "false_alarms": len(false_alarms), "inconclusive": len(inconclusive),
        "per_case": {w: {"expected": truth[w]["expected_verdict"], "role": truth[w].get("role"),
                         "predicted": predictions.get(w, {}).get("verdict")} for w in sorted(truth)},
    }


def print_table(title: str, result: dict) -> None:
    print(f"\n{title}")
    print(f"  correct {result['correct']}/{result['cases']} | failures caught {result['caught']}/{result['failing_cases']}"
          f" | false alarms {result['false_alarms']}/{result['safe_cases']} | inconclusive {result['inconclusive']}")
    for world, row in result["per_case"].items():
        mark = "ok " if row["predicted"] == row["expected"] else "XX "
        print(f"  {mark}{world}  {str(row['role']):20} expected={row['expected']:20} predicted={row['predicted']}")
