"""cleanup-job: reads a list of record IDs and asks lifecycle-api to remove each one.

Prints one JSON summary line on stdout; progress goes to stderr.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lifecycle_api  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", required=True)
    parser.add_argument("--targets", required=True)
    parser.add_argument("--mode", required=True, choices=("permanent", "mark"))
    args = parser.parse_args()

    ids = [line.strip() for line in Path(args.targets).read_text(encoding="utf-8").splitlines()[1:] if line.strip()]
    conn = sqlite3.connect(args.registry)
    processed, not_found, removed = 0, 0, []
    for record_id in ids:
        outcome = lifecycle_api.delete_record(conn, record_id, args.mode)
        processed += 1
        if outcome["result"] == "not_found":
            not_found += 1
            print(f"{record_id}: not found, skipped", file=sys.stderr)
        else:
            removed += outcome["removed"]
            print(f"{record_id}: removed {len(outcome['removed'])} record(s)", file=sys.stderr)
    conn.commit()
    conn.close()
    print(f"processed {processed} id(s); {not_found} not found; {len(removed)} record(s) removed", file=sys.stderr)
    print(json.dumps({"processed": processed, "not_found": not_found, "removed": removed}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
