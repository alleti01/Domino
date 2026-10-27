"""Writes the e4 case files into worlds/cases/. Re-run after editing CASES.

Only structural parameters live here. What each case is expected to do lives in the private ground truth.
"""

from __future__ import annotations

import json
from pathlib import Path

CASES_DIR = Path(__file__).resolve().parents[2] / "cases"
CHANGE = "0317"
FILE = "services/orders/handler.py"
TRAFFIC = {"base_rps": 50, "burst_rps": 100, "burst_s": 4, "burst_every_s": 30, "burst_start_s": 10, "duration_s": 60}

# case_id: order-service workers, its time per attempt today, and the latency of the call the change adds
CASES = {
    "w-c5h2": {"workers": 8, "service_time_ms": 60, "added_call_ms": 40},
    "w-f8w3": {"workers": 12, "service_time_ms": 60, "added_call_ms": 40},
    "w-v2k9": {"workers": 8, "service_time_ms": 60, "added_call_ms": 10},
}
GATEWAY = {"timeout_ms": 250, "max_retries": 2}

DIFF = f"""--- a/{FILE}
+++ b/{FILE}
@@ -12,6 +12,7 @@ def handle_order(request):
     order = validate(request)
     price(order)
+    inventory.reserve(order.items)  # hold stock before confirming
     return confirm(order)
"""


def build(case_id: str, spec: dict) -> dict:
    title = "Orders: reserve stock before confirming an order"
    return {
        "engine": "e4",
        "describe": {
            "title": title,
            "components": [
                {"name": "api-gateway", "role": "routes client requests to order-service"},
                {"name": "order-service", "role": "validates, prices and confirms orders on a worker pool"},
                {"name": "inventory-service", "role": "holds stock for an order"},
            ],
            "change": {
                "entity_id": f"{case_id}/change/{CHANGE}",
                "title": title,
                "description": "order-service now reserves stock with inventory-service before it confirms an order. "
                               "Unit tests pass.",
                "files": [FILE],
                "diff": DIFF,
            },
            "variants": {
                "baseline": "system without the change, under recorded production traffic",
                "candidate": "system with the change applied, under the same traffic",
                "control": "change applied, then reverted, under the same traffic",
            },
            "params": {},
            "metrics": ["api-gateway.requests", "api-gateway.succeeded", "api-gateway.failed",
                        "api-gateway.retries_sent", "api-gateway.p99_latency_ms", "order-service.attempts_handled",
                        "order-service.max_queue_depth", "order-service.queue_depth_at_end"],
        },
        "setup": {**spec, **GATEWAY, "traffic": TRAFFIC, "change_id": CHANGE, "file": FILE},
    }


if __name__ == "__main__":
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    for case_id, spec in CASES.items():
        (CASES_DIR / f"{case_id}.json").write_text(json.dumps(build(case_id, spec), indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(CASES)} cases to {CASES_DIR}")
