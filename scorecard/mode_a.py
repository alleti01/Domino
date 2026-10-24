"""Mode A: static checks only. The baseline every other mode must beat.

Reads nothing but the change itself (the PR diff from describe_world), like a policy linter:
no Zetaris, no cross-source links, no experiments, no model. Rules are written for typical risky
change types, not for any particular world.

    python3 scorecard/mode_a.py          predictions + score against the private ground truth
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_layer import describe_world, list_worlds  # noqa: E402
import score as scoring  # noqa: E402

RULES = [
    ("widens_read_access", re.compile(r"^\+\s*GRANT\s+(SELECT|ALL)\b", re.IGNORECASE | re.MULTILINE)),
    ("drops_or_retypes_schema", re.compile(r"^\+\s*(DROP\s+(TABLE|COLUMN)|ALTER\s+TABLE\s+\S+\s+(DROP|ALTER))", re.IGNORECASE | re.MULTILINE)),
    ("changes_dependency_version", re.compile(r"^\+.*(==|>=|~=|\"\^?\d+\.\d+)", re.MULTILINE)),
    ("lowers_a_limit", re.compile(r"^\+.*(max|limit|capacity|timeout)[_a-z]*\s*[:=]\s*\d+", re.IGNORECASE | re.MULTILINE)),
]


def predict(world: str) -> dict:
    described = describe_world(world)
    diff = (described.get("change") or {}).get("diff") or ""
    fired = [name for name, pattern in RULES if pattern.search(diff)]
    return {"verdict": "reproduced_failure" if fired else "no_failure_observed", "rules_fired": fired,
            "calls": {"describe_world": 1}}


def main() -> int:
    predictions = {w: predict(w) for w in list_worlds()}
    for world, p in sorted(predictions.items()):
        print(f"{world}: {p['verdict']:20} rules fired: {p['rules_fired'] or '-'}")
    scoring.print_table("Mode A (static checks on the diff only)", scoring.score(predictions))
    return 0


if __name__ == "__main__":
    sys.exit(main())
