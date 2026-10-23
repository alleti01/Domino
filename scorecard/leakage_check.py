"""Leakage check: scans everything the agent can see for words that give away answers, and guards the repo.

Agent-visible surfaces: world IDs, describe_world output, run_experiment output (metric and assertion
names, logs) for every case and variant, and the Zetaris source files, SQL and snapshots.

Repo guards (the repo is shared with teammates, so answers must never be in it):
  - no ground-truth label file is tracked by git (labels live in DOMINO_PRIVATE_DIR/ground_truth/)
  - no tracked file mentions a held-out world ID (held-out worlds live in DOMINO_PRIVATE_DIR/worlds/)
And, when the private labels are available: every world has a label and every label has a world.

    python3 scorecard/leakage_check.py        exit 0 = clean, 1 = leak or label mismatch
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_layer import config  # noqa: E402
from data_layer.experiments import VARIANTS, describe_world, list_worlds, run_experiment  # noqa: E402

BANNED = [
    r"cloudflare", r"crowdstrike", r"clickhouse", r"duplicat", r"dedup", r"cardinalit", r"overflow",
    r"out[\s_-]?of[\s_-]?bounds", r"root[\s_-]?cause", r"verdict", r"ground[\s_-]?truth", r"expected[\s_-]?(?:result|outcome)",
    r"safe[\s_-]?twin", r"near[\s_-]?miss", r"surprise", r"held[\s_-]?out", r"holdout", r"\bbug\b", r"incident", r"outage",
]
VISIBLE_FILE_DIRS = [ROOT / "zetaris" / "sources", ROOT / "zetaris" / "sql", ROOT / "zetaris" / "snapshots"]


def labels_path() -> Path:
    return config.private_dir() / "ground_truth" / "cases.json"


def _labels() -> dict:
    path = labels_path()
    return json.loads(path.read_text(encoding="utf-8"))["cases"] if path.is_file() else {}


def _patterns(labels: dict) -> list:
    # Family labels are distinctive; role labels include generic words like "primary", and the
    # distinctive roles (safe twin, near miss) are already in BANNED.
    extra = {re.escape(v["family"]) for v in labels.values() if v.get("family")}
    return [re.compile(p, re.IGNORECASE) for p in BANNED + sorted(extra)]


def _hits(where: str, text: str, patterns: list) -> list:
    return [f"{where}: '{m.group(0)}'" for p in patterns for m in p.finditer(text)]


def repo_guard_problems() -> list:
    """Checks the files git tracks (and those staged), since those are what a teammate gets."""
    try:
        tracked = subprocess.run(["git", "ls-files", "--cached"], cwd=ROOT, capture_output=True, text=True,
                                 check=True, timeout=30).stdout.split()
    except (OSError, subprocess.SubprocessError):
        return ["could not list git-tracked files"]
    problems = [f"answer file tracked by git: {f}" for f in tracked
                if f.startswith("ground_truth/") and f != "ground_truth/README.md"]
    private_ids = config.private_world_ids()
    if private_ids:
        pattern = re.compile("|".join(re.escape(w) for w in private_ids))
        for f in tracked:
            path = ROOT / f
            if path.is_file() and path.stat().st_size < 5_000_000:
                for m in pattern.finditer(path.read_text(encoding="utf-8", errors="replace")):
                    problems.append(f"held-out world id '{m.group(0)}' in tracked file {f}")
    return problems


def main() -> int:
    labels = _labels()
    patterns = _patterns(labels)
    problems = repo_guard_problems()

    worlds = list_worlds()
    if labels:
        missing, orphan = sorted(set(worlds) - set(labels)), sorted(set(labels) - set(worlds))
        if missing:
            problems.append(f"worlds with no ground-truth label: {missing}")
        if orphan:
            problems.append(f"labels with no world: {orphan}")
    else:
        print(f"note: no private labels at {labels_path()}; label checks skipped (fine on a teammate's machine)")

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

    checked = (f"{len(worlds)} worlds x {len(VARIANTS)} variants, describe output, Zetaris sources/SQL/snapshots, "
               f"repo guards")
    if problems:
        print(f"LEAKAGE CHECK FAILED ({checked}):")
        for p in problems:
            print("  - " + p)
        return 1
    print(f"Leakage check passed: {checked}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
