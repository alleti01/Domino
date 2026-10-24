"""Data-quality report: runs every DQ rule on the USL and shows the invalid records instead of hiding them.

    python3 zetaris/dq_report.py

Rules come from `LIST DQ USL` (the key rules Zetaris generates from PRIMARY / FOREIGN KEYs, plus
sql/04_dq.sql). Runs as the admin login (SHOW DQ needs it). Writes:
  zetaris/snapshots/dq_report.json                 public copy; rows from held-out worlds are left out
  $DOMINO_PRIVATE_DIR/zetaris/snapshots/dq_report.json   full copy
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from data_layer import config  # noqa: E402
from data_layer.zetaris_client import ZetarisClient, ZetarisError  # noqa: E402

USL = "lightning.metastore.domino.systems"


def main() -> int:
    client = ZetarisClient("admin")
    run = lambda sql: client.run(sql, read_only=False, timeout_s=300, purpose="dq-report")  # noqa: E731
    rules = run(f"LIST DQ USL {USL}").rows
    report = {"usl": USL, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "rules": []}
    print(f"{'rule':24} {'table':20} {'type':26} {'total':>6} {'valid':>6} {'invalid':>7}")
    for rule in rules:
        name, table = rule["name"], rule["table"]
        entry = {"rule": name, "table": table, "type": rule.get("type"), "expression": rule.get("expression")}
        try:
            counts = run(f"RUN DQ {name} TABLE {USL}.{table}").rows[0]
            entry.update(total=int(counts["total_record"]), valid=int(counts["valid_record"]),
                         invalid=int(counts["invalid_record"]))
            if entry["invalid"]:
                entry["invalid_records"] = run(f"SHOW DQ INVALID RECORD {name} TABLE {USL}.{table}").rows
        except (ZetarisError, KeyError, IndexError, ValueError) as error:
            entry["error"] = str(error)[:300]
        report["rules"].append(entry)
        print(f"{name:24} {table:20} {str(entry.get('type')):26} {entry.get('total', '-'):>6} "
              f"{entry.get('valid', '-'):>6} {entry.get('invalid', 'ERR'):>7}")

    private_ids = config.private_world_ids()
    public = json.loads(json.dumps(report))
    hidden = 0
    for entry in public["rules"]:
        rows = entry.get("invalid_records") or []
        kept = [r for r in rows if not any(w in json.dumps(r) for w in private_ids)]
        hidden += len(rows) - len(kept)
        if rows:
            entry["invalid_records"] = kept
            entry["invalid_records_kept_private"] = len(rows) - len(kept)
    (HERE / "snapshots").mkdir(exist_ok=True)
    (HERE / "snapshots" / "dq_report.json").write_text(json.dumps(public, indent=2) + "\n", encoding="utf-8")
    private = config.private_dir() / "zetaris" / "snapshots"
    private.mkdir(parents=True, exist_ok=True)
    (private / "dq_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print("\nInvalid records (public view):")
    for entry in public["rules"]:
        for row in entry.get("invalid_records") or []:
            keys = [k for k in row if k.endswith("_id") or k in ("edge_status", "relation", "evidence", "detail")]
            print(f"  [{entry['rule']} on {entry['table']}] " + "; ".join(f"{k}={row[k]}" for k in keys[:6]))
    if hidden:
        print(f"  ({hidden} invalid row(s) kept private (not in the repo copy))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
