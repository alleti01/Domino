"""Self-check: every scenario's baseline and control pass, and the candidate matches answers.json.

    python3 -m practice check
"""

from __future__ import annotations

import json
from pathlib import Path

from . import api


def main() -> int:
    answers = json.loads((Path(__file__).parent / "answers.json").read_text(encoding="utf-8"))["scenarios"]
    bad = 0
    for world in api.list_worlds():
        runs = {v: api.run_experiment(world, v) for v in api.VARIANTS}
        path = api.dependency_path(api.describe_world(world)["change"]["entity_id"])
        expected_fail = answers[world]["expected_verdict"] == "reproduced_failure"
        ok = (runs["baseline"]["passed"] and runs["control"]["passed"]
              and runs["candidate"]["passed"] is (not expected_fail) and path["status"] == "ok")
        bad += not ok
        print(f"{'ok ' if ok else 'XX '}{world}  expected={answers[world]['expected_verdict']:20} "
              f"candidate passed={runs['candidate']['passed']}  paths={len(path['paths'])}")
    print(f"\n{len(answers) - bad}/{len(answers)} scenarios consistent")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
