"""Zetaris facts for engine e3 cases. Called by zetaris/build_sources.py.

Split so no single source shows the problem: the change says which fields the new rule reads
(change_records); the registry lists the template and its existing rules (inventory_registry); the
service catalog says what the template declares, what the validator checks against, and how many
inputs the interpreter supplies (service_catalog).
"""

from __future__ import annotations


def facts_for_case(case_id: str, case: dict) -> dict:
    setup, title = case["setup"], case["describe"]["change"]["title"]
    (template, tdef), = setup["templates"].items()
    new = setup["new_rule"]
    fields = ",".join(new["criteria"])
    items = [
        {"change_id": setup["change_id"], "file_path": setup["file"], "item_kind": "adds_rule", "item_ref": new["rule_id"],
         "item_detail": f"template={template}; matches_on={fields}; all other fields wildcard", "title": title},
        {"change_id": setup["change_id"], "file_path": setup["file"], "item_kind": "runs_component",
         "item_ref": "content-pipeline", "item_detail": "validate, then ship to content-interpreter", "title": title},
    ]
    records = [{"record_id": template, "record_kind": "template_type", "parent_record_id": "", "owner": "content-team",
                "status": "active"}]
    records += [{"record_id": r["rule_id"], "record_kind": "rule_instance", "parent_record_id": template,
                 "owner": "content-team", "status": "shipped"} for r in setup["existing_rules"]]
    contracts = [
        ("content-pipeline", "calls", "rule-validator.validate", "step", "1"),
        ("content-pipeline", "ships_to", "content-interpreter.load_rules", "step", "2"),
        (new["rule_id"], "instance_of", f"template:{template}", "matches_on", fields),
        ("template-registry", "declares", f"template:{template}", "field_count", str(tdef["field_count"])),
        ("rule-validator.validate", "checks_against", f"template:{template}", "field_count", str(tdef["field_count"])),
        ("content-interpreter.load_rules", "evaluates", f"template:{template}", "inputs_supplied",
         str(setup["consumer_inputs"])),
        ("telemetry-agent", "reads", "template:T2", "field_count", "9"),
    ]
    contracts += [(r["rule_id"], "instance_of", f"template:{template}", "matches_on", ",".join(r["criteria"]))
                  for r in setup["existing_rules"]]
    if setup["validator_checks_consumer"]:
        contracts.append(("rule-validator.validate", "checks_against", "content-interpreter.load_rules",
                          "inputs_supplied", str(setup["consumer_inputs"])))
    return {
        "change_items": items,
        "inventory_records": records,
        "interface_contracts": [{"component": c, "relation": rel, "target": t, "contract_key": k, "contract_value": v}
                                for c, rel, t, k, v in contracts],
    }
