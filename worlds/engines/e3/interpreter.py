"""content-interpreter: evaluates every shipped rule against incoming events.

Each event arrives as a fixed-length list of input values. Only the fields a rule names are read;
wildcard fields are skipped. Exit 0 = all events processed, 3 = the interpreter stopped.
Prints one JSON summary line on stdout.
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
    parser.add_argument("--inputs", type=int, required=True)
    parser.add_argument("--events", type=int, default=50)
    args = parser.parse_args()

    rules = rule_files.read_rules(Path(args.rules))
    matches = processed = 0
    for e in range(args.events):
        values = [f"v{e}-{i}" for i in range(args.inputs)]
        try:
            for rule in rules:
                # Load every named input first, then compare (so every named slot is read, every time).
                got = {f: values[rule_files.field_index(f)] for f in rule["criteria"]}
                if all(got[f] == want for f, want in rule["criteria"].items()):
                    matches += 1
        except IndexError:
            print(f"fatal: event {e}: rule {rule['rule_id']} read an input slot that does not exist "
                  f"({len(values)} inputs supplied); interpreter stopped", file=sys.stderr)
            print(json.dumps({"events_processed": processed, "matches": matches}))
            return 3
        processed += 1
    print(f"processed {processed} event(s) with {len(rules)} rule(s); {matches} match(es)", file=sys.stderr)
    print(json.dumps({"events_processed": processed, "matches": matches}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
