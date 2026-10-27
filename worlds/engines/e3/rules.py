"""Shared rule-file helpers for engine e3. A rule names its template and the fields it matches on;
any field it does not list is a wildcard and is never read."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List


def field_index(name: str) -> int:
    """'f21' -> 20 (zero-based)."""
    return int(name[1:]) - 1


def write_rules(folder: Path, rules: List[Dict]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for rule in rules:
        (folder / f"{rule['rule_id']}.json").write_text(json.dumps(rule, sort_keys=True), encoding="utf-8")


def read_rules(folder: Path) -> List[Dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))]
