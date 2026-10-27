"""Zetaris facts for engine e2 cases (private). Called by zetaris/build_sources.py.

Facts are split so no single source shows the problem: the change lists IDs (change_records), the
registry says what each ID is (inventory_registry), and the service catalog says what the job calls and
what that call does to each kind of record (service_catalog).
"""

from __future__ import annotations


def facts_for_case(case_id: str, case: dict) -> dict:
    setup = case["setup"]
    change, files, title = setup["change_id"], setup["files"], case["describe"]["change"]["title"]
    items = [{"change_id": change, "file_path": files[1], "item_kind": "target_id", "item_ref": rid,
              "item_detail": "listed for removal", "title": title} for rid in setup["targets"]]
    items.append({"change_id": change, "file_path": files[0], "item_kind": "runs_component", "item_ref": "cleanup-job",
                  "item_detail": f"mode={setup['mode']}; input=targets.csv", "title": title})
    records = [{"record_id": r["record_id"], "record_kind": r["kind"], "parent_record_id": r["parent_id"],
                "owner": r["owner"], "status": r["status"]} for r in setup["records"]]
    contracts = [
        ("cleanup-job", "calls", "lifecycle-api.delete_record", "mode", setup["mode"]),
        ("lifecycle-api.delete_record", "accepts", "record:app", "effect", "removes the record"),
        ("lifecycle-api.delete_record", "accepts", "record:site", "effect", "removes the record and its child records"),
        ("reports-service", "reads", "record:app", "kind", "app:legacy-reports"),
        ("billing-sync", "reads", "record:site", "field", "owner"),
    ]
    return {
        "change_items": items,
        "inventory_records": records,
        "interface_contracts": [{"component": c, "relation": rel, "target": t, "contract_key": k, "contract_value": v}
                                for c, rel, t, k, v in contracts],
    }
