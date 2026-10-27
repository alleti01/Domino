"""Zetaris facts for engine e4 cases. Called by zetaris/build_sources.py.

Split so no single source shows the problem: the change says what call it adds (change_records); the
service catalog says how long that call and order-service take, the pool size, the gateway's timeout and
retry policy, and the traffic the gateway receives (service_catalog).
"""

from __future__ import annotations


def facts_for_case(case_id: str, case: dict) -> dict:
    s, title = case["setup"], case["describe"]["change"]["title"]
    t = s["traffic"]
    items = [
        {"change_id": s["change_id"], "file_path": s["file"], "item_kind": "adds_call", "item_ref": "order-service.handle_order",
         "item_detail": "handle_order now calls inventory-service.reserve before confirm", "title": title},
        {"change_id": s["change_id"], "file_path": s["file"], "item_kind": "adds_call", "item_ref": "inventory-service.reserve",
         "item_detail": "called once per order, synchronously", "title": title},
    ]
    contracts = [
        ("order-service.handle_order", "takes", "latency:order-service.handle_order", "service_time_ms", str(s["service_time_ms"])),
        ("order-service.handle_order", "runs_on", "pool:order-workers", "workers", str(s["workers"])),
        ("order-service.handle_order", "called_by", "api-gateway", "cancels_on_caller_timeout", "no"),
        ("inventory-service.reserve", "takes", "latency:inventory-service.reserve", "latency_p50_ms", str(s["added_call_ms"])),
        ("api-gateway", "routes_to", "order-service.handle_order", "timeout_ms", str(s["timeout_ms"])),
        ("api-gateway", "retries", "order-service.handle_order", "max_retries", str(s["max_retries"])),
        ("api-gateway", "receives", "traffic:/orders", "rps_profile",
         f"{t['base_rps']} rps; {t['burst_rps']} rps for {t['burst_s']} s every {t['burst_every_s']} s"),
        ("status-page", "polls", "api-gateway", "interval_s", "30"),
    ]
    return {
        "change_items": items,
        "interface_contracts": [{"component": c, "relation": rel, "target": tg, "contract_key": k, "contract_value": v}
                                for c, rel, tg, k, v in contracts],
    }
