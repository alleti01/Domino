"""worker-runtime: loads a bundle file into a fixed-size table at startup.

Exits 0 when the bundle loads, 2 when it cannot. Prints one JSON summary line on stdout.
"""

from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", required=True)
    parser.add_argument("--config", required=True)
    args = parser.parse_args()

    with open(args.config, encoding="utf-8") as fh:
        slots = int(json.load(fh)["max_entries"])
    with open(args.bundle, encoding="utf-8") as fh:
        entries = json.load(fh)["entries"]

    if len(entries) > slots:
        print(f"fatal: bundle has {len(entries)} entries but the runtime preallocates {slots}; refusing to start", file=sys.stderr)
        print(json.dumps({"loaded_entries": 0}))
        return 2

    table = [None] * slots
    for i, entry in enumerate(entries):
        table[i] = (entry["name"], entry["type"])
    print(f"started with {len(entries)} entries", file=sys.stderr)
    print(json.dumps({"loaded_entries": len(entries)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
