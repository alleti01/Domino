"""bundle-builder: reads field metadata for one table from the metadata store and writes a bundle file.

Prints one JSON summary line on stdout; human-readable progress goes to stderr.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import catalog  # noqa: E402

QUERY = "SELECT name, type FROM system_columns WHERE tbl = ? ORDER BY name"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", required=True)
    parser.add_argument("--principal", required=True)
    parser.add_argument("--table", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--collapse-same-name", action="store_true")
    args = parser.parse_args()

    conn = catalog.connect_as(args.catalog, args.principal)
    rows = conn.execute(QUERY, (args.table,)).fetchall()
    conn.close()

    entries = [{"name": name, "type": type_} for name, type_ in rows]
    if args.collapse_same_name:
        entries = list({e["name"]: e for e in entries}.values())

    data = json.dumps({"version": 1, "table": args.table, "entries": entries},
                      sort_keys=True, separators=(",", ":")).encode("utf-8")
    Path(args.out).write_bytes(data)
    print(f"read {len(rows)} rows for table {args.table}; wrote {len(entries)} entries ({len(data)} bytes)", file=sys.stderr)
    print(json.dumps({"visible_rows": len(rows), "entries": len(entries), "bytes": len(data),
                      "sha256": hashlib.sha256(data).hexdigest()}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
