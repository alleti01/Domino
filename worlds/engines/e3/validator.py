"""rule-validator: checks every rule file before it ships.

By default it checks each rule against the template's declared field count. With --consumer-inputs it
also checks against the number of inputs the content interpreter supplies.
Exit 0 = all rules valid, 1 = at least one rejected. Prints one JSON summary line on stdout.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rules as rule_files  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rules", required=True)
    parser.add_argument("--templates", required=True)
    parser.add_argument("--consumer-inputs", type=int)
    args = parser.parse_args()

    templates = json.loads(Path(args.templates).read_text(encoding="utf-8"))
    rejected = []
    rules = rule_files.read_rules(Path(args.rules))
    for rule in rules:
        declared = templates[rule["template"]]["field_count"]
        limit = min(declared, args.consumer_inputs) if args.consumer_inputs else declared
        too_far = [f for f in rule["criteria"] if rule_files.field_index(f) >= limit]
        if too_far:
            rejected.append(rule["rule_id"])
            print(f"{rule['rule_id']}: rejected, fields {too_far} beyond {limit}", file=sys.stderr)
    print(f"checked {len(rules)} rule(s); {len(rejected)} rejected", file=sys.stderr)
    print(json.dumps({"checked": len(rules), "rejected": rejected}))
    return 1 if rejected else 0


if __name__ == "__main__":
    sys.exit(main())
