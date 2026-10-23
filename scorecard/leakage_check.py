"""Leakage check: scans everything the agent can see for words that give away answers.

Agent-visible surfaces: world IDs, describe_world output, run_experiment output (metric and assertion
names, logs) for every case and variant, and the Zetaris source files and SQL. Also checks that every
world has a ground-truth label and vice versa.

    python3 scorecard/leakage_check.py        exit 0 = clean, 1 = leak or label mismatch
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_layer.experiments import VARIANTS, describe_world, list_worlds, run_experiment  # noqa: E402

BANNED = [
    r"cloudflare", r"crowdstrike", r"clickhouse", r"duplicat", r"dedup", r"cardinalit", r"overflow",
    r"out[\s_-]?of[\s_-]?bounds", r"root[\s_-]?cause", r"verdict", r"ground[\s_-]?truth", r"expected[\s_-]?(?:result|outcome)",
    r"safe[\s_-]?twin", r"near[\s_-]?miss", r"surprise", r"held[\s_-]?out", r"holdout", r"\bbug\b", r"incident", r"outage",
]
VISIBLE_FILE_DIRS = [ROOT / "zetaris" / "sources", ROOT / "zetaris" / "sql"]


def _labels() -> dict:
    return json.loads((ROOT / "ground_truth" / "cases.json").read_text(encoding="utf-8"))["cases"]


def _patterns(labels: dict) -> list:
    extra = {re.escape(v[k]) for v in labels.values() for k in ("family", "role") if v.get(k)}
    return [re.compile(p, re.IGNORECASE) for p in BANNED + sorted(extra)]


def _hits(where: str, text: str, patterns: list) -> list:
    return [f"{where}: '{m.group(0)}'" for p in patterns for m in p.finditer(text)]


def main() -> int:
    labels = _labels()
    patterns = _patterns(labels)
    problems = []

    worlds = list_worlds()
    missing, orphan = sorted(set(worlds) - set(labels)), sorted(set(labels) - set(worlds))
    if missing:
        problems.append(f"worlds with no ground-truth label: {missing}")
    if orphan:
        problems.append(f"labels with no world: {orphan}")

    for world in worlds:
        problems += _hits(f"world id {world}", world, patterns)
        problems += _hits(f"describe_world({world})", json.dumps(describe_world(world)), patterns)
        for variant in VARIANTS:
            result = run_experiment(world, variant)
            if result.get("status") != "ok":
                problems.append(f"run_experiment({world}, {variant}) status={result.get('status')}: {result.get('error')}")
            problems += _hits(f"run_experiment({world}, {variant})", json.dumps(result), patterns)

    for folder in VISIBLE_FILE_DIRS:
        for path in sorted(folder.rglob("*")) if folder.is_dir() else []:
            if path.is_file() and not path.name.startswith("."):
                rel = path.relative_to(ROOT)
                problems += _hits(str(rel), rel.as_posix() + "\n" + path.read_text(encoding="utf-8", errors="replace"), patterns)

    checked = f"{len(worlds)} worlds x {len(VARIANTS)} variants, describe output, Zetaris sources/SQL"
    if problems:
        print(f"LEAKAGE CHECK FAILED ({checked}):")
        for p in problems:
            print("  - " + p)
        return 1
    print(f"Leakage check passed: {checked}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
