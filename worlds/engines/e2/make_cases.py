"""Writes the e2 case files into the PRIVATE worlds/cases/ folder. Re-run after editing CASES.

Only structural parameters live here; expected outcomes live in the private ground_truth/.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import registry  # noqa: E402

CASES_DIR = HERE.parents[1] / "cases"
APP_KINDS = ["legacy-reports", "boards", "wiki"]
N_SITES = 20
CHANGE = "0187"
FILES = ["ops/cleanup/0187_retire_reports_addon/run.yaml", "ops/cleanup/0187_retire_reports_addon/targets.csv"]

# case_id: which IDs the migrations team put in the list
CASES = {
    "w-q8f3": {"pick": "sites", "count": 12},
    "w-m5x1": {"pick": "legacy_apps", "count": 12},
    "w-j2r7": {"pick": "legacy_apps_plus_one_site", "count": 12},
    "w-b6n4": {"pick": "legacy_apps_plus_one_unknown", "count": 12},
}


def targets(case_id: str, pick: str, count: int) -> list:
    sites = [registry.record_id(case_id, "site", i) for i in range(count)]
    apps = [registry.record_id(case_id, "app:legacy-reports", i) for i in range(count)]
    if pick == "sites":
        return sites
    if pick == "legacy_apps":
        return apps
    if pick == "legacy_apps_plus_one_site":
        return apps[:5] + [sites[5]] + apps[6:]
    if pick == "legacy_apps_plus_one_unknown":
        return apps[:7] + [registry.record_id(case_id, "retired", 7)] + apps[8:]
    raise ValueError(pick)


def build(case_id: str, spec: dict) -> dict:
    ids = targets(case_id, spec["pick"], spec["count"])
    run_yaml = ["job: cleanup-job", "operation: lifecycle-api.delete_record", "mode: permanent",
                "input: targets.csv"]
    csv_lines = ["record_id", *ids]
    diff = (f"--- /dev/null\n+++ b/{FILES[0]}\n@@ -0,0 +1,{len(run_yaml)} @@\n" + "".join(f"+{l}\n" for l in run_yaml)
            + f"--- /dev/null\n+++ b/{FILES[1]}\n@@ -0,0 +1,{len(csv_lines)} @@\n" + "".join(f"+{l}\n" for l in csv_lines))
    return {
        "engine": "e2",
        "describe": {
            "title": "Remove the retired reports add-on from migrated tenants",
            "components": [
                {"name": "tenant-registry", "role": "registry of tenant records; sites own app records"},
                {"name": "cleanup-job", "role": "reads an ID list and asks lifecycle-api to remove each record"},
                {"name": "lifecycle-api", "role": "removes a registry record by ID"},
            ],
            "change": {
                "entity_id": f"{case_id}/change/{CHANGE}",
                "title": "Remove the retired reports add-on from migrated tenants",
                "description": "The migrations team supplied the list of add-on instances to remove for tenants "
                               "that finished moving to the new reporting service. Runs the standard cleanup job "
                               "with permanent removal.",
                "files": FILES,
                "diff": diff,
            },
            "variants": {
                "baseline": "system without the change (the job is not run)",
                "candidate": "system with the change applied (the job runs over the ID list)",
                "control": "change applied, then reverted (the ID list is removed)",
            },
            "params": {},
            "metrics": ["tenant-registry.records_before", "tenant-registry.records_after", "cleanup-job.ids_processed",
                        "cleanup-job.ids_not_found", "tenant-registry.removed_listed",
                        "tenant-registry.removed_unlisted", "tenant-registry.removed_sites",
                        "tenant-registry.removed_apps"],
        },
        "setup": {"records": registry.layout(case_id, N_SITES, APP_KINDS), "targets": ids, "mode": "permanent",
                  "change_id": CHANGE, "files": FILES},
    }


if __name__ == "__main__":
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    for case_id, spec in CASES.items():
        (CASES_DIR / f"{case_id}.json").write_text(json.dumps(build(case_id, spec), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(CASES)} cases to {CASES_DIR}")
