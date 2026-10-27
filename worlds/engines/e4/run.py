"""Engine e4: api-gateway -> order-service -> inventory-service, under a recorded traffic profile.

    python3 run.py --case <case.json> --variant baseline|candidate|control [--params JSON]

baseline  = order-service without the change
candidate = order-service with the change (its added call adds to every attempt's time)
control   = the change applied, then reverted (same as baseline)
traffic (its own process) writes the arrival schedule; serve (its own process) runs the gateway and the
service over it, event by event. Prints one JSON result line (see data_layer/experiments.py for the shape).
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEP_TIMEOUT_S = 20
SUCCESS_TARGET = 0.99
ACCEPTED_PARAMS: dict = {"overrides": "settings to change before the run, as {target: value}"}

# Settings a fix may change, named as the semantic layer names them (service_catalog component.key).
_SETTINGS = [
    {"target": "api-gateway.timeout_ms", "type": "number", "description": "api-gateway setting",
     "get": lambda s: s["timeout_ms"], "set": lambda s, v: s.__setitem__("timeout_ms", v)},
    {"target": "api-gateway.max_retries", "type": "number", "description": "api-gateway setting",
     "get": lambda s: s["max_retries"], "set": lambda s, v: s.__setitem__("max_retries", v)},
    {"target": "order-service.handle_order.workers", "type": "number", "description": "order-service setting",
     "get": lambda s: s["workers"], "set": lambda s, v: s.__setitem__("workers", v)},
]


def overridable(setup: dict) -> list:
    """What `describe` lists as changeable, with each setting's current value."""
    return [{"target": s["target"], "current": s["get"](setup), "type": s["type"], "description": s["description"]}
            for s in _SETTINGS]


def apply_overrides(setup: dict, overrides) -> tuple:
    """(a copy of setup with every override applied, log lines) or (None, reason). Never a silent no-op."""
    if not isinstance(overrides, dict):
        return None, "overrides must be an object of target -> value"
    by_target = {s["target"]: s for s in _SETTINGS}
    out, applied = copy.deepcopy(setup), []
    for raw, value in overrides.items():
        target = str(raw).split("/setting/")[-1]
        spec = by_target.get(target)
        if spec is None:
            return None, f"unknown override target {raw!r}; overridable: {sorted(by_target)}"
        kind = spec["type"]
        if ((kind == "number" and (isinstance(value, bool) or not isinstance(value, (int, float))))
                or (kind == "boolean" and not isinstance(value, bool))
                or (kind == "string" and value not in spec.get("choices", [value]))):
            return None, f"override {target} must be {spec.get('choices') or 'a ' + kind}, got {value!r}"
        spec["set"](out, value)
        applied.append(f"harness: applied override {target} = {json.dumps(value)}")
    return out, applied


def _step(name: str, args: list) -> tuple:
    proc = subprocess.run([sys.executable, "-E", "-s", str(HERE / f"{name}.py"), *args],
                          capture_output=True, text=True, timeout=STEP_TIMEOUT_S)
    try:
        summary = json.loads(proc.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError):
        summary = {}
    return proc.returncode, summary, [line for line in proc.stderr.splitlines() if line.strip()]


def run(setup: dict, variant: str, params: dict) -> dict:
    unknown = sorted(set(params) - set(ACCEPTED_PARAMS))
    if unknown:
        return {"error": f"unsupported params: {unknown}"}
    setup, override_logs = apply_overrides(setup, params.get("overrides") or {})
    if setup is None:
        return {"error": override_logs}
    input_sha = hashlib.sha256(json.dumps({"setup": setup, "variant": variant, "params": params},
                                          sort_keys=True).encode()).hexdigest()
    service_time = setup["service_time_ms"] + (setup["added_call_ms"] if variant == "candidate" else 0)
    config = {"workers": setup["workers"], "service_time_ms": service_time, "timeout_ms": setup["timeout_ms"],
              "max_retries": setup["max_retries"]}
    with tempfile.TemporaryDirectory(prefix="e4-") as tmp:
        work = Path(tmp)
        profile, arrivals, cfg = work / "profile.json", work / "arrivals.json", work / "config.json"
        profile.write_text(json.dumps(setup["traffic"]), encoding="utf-8")
        cfg.write_text(json.dumps(config), encoding="utf-8")
        logs = list(override_logs)
        t_code, _, t_log = _step("traffic", ["--profile", str(profile), "--out", str(arrivals)])
        logs += [f"traffic: {line}" for line in t_log]
        s_code, s, s_log = _step("serve", ["--arrivals", str(arrivals), "--config", str(cfg)]) if t_code == 0 else (None, {}, [])
        logs += s_log
    rate = s["succeeded"] / s["requests"] if s.get("requests") else None
    assertions = [
        {"name": "gateway_success_rate", "passed": rate is not None and rate >= SUCCESS_TARGET,
         "observed": "not run" if rate is None else f"{rate:.3f}", "expected": f">= {SUCCESS_TARGET}"},
        {"name": "order_service_queue_drains", "passed": s_code == 0 and s.get("queue_depth_at_end", 1e9) <= setup["workers"],
         "observed": f"{s.get('queue_depth_at_end')} queued at end", "expected": f"<= {setup['workers']} queued at end"},
    ]
    state = json.dumps(s, sort_keys=True).encode()
    return {
        "passed": all(a["passed"] for a in assertions),
        "assertions": assertions,
        "metrics": {
            "api-gateway.requests": s.get("requests"),
            "api-gateway.succeeded": s.get("succeeded"),
            "api-gateway.failed": s.get("failed"),
            "api-gateway.retries_sent": s.get("retries"),
            "api-gateway.p99_latency_ms": s.get("p99_latency_ms"),
            "order-service.attempts_handled": s.get("attempts_handled"),
            "order-service.max_queue_depth": s.get("max_queue_depth"),
            "order-service.queue_depth_at_end": s.get("queue_depth_at_end"),
        },
        "artifacts": [{"name": "serve_summary.json", "sha256": hashlib.sha256(state).hexdigest(), "bytes": len(state)}],
        "logs": logs,
        "input_sha256": input_sha,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", required=True)
    parser.add_argument("--variant", choices=("baseline", "candidate", "control"))
    parser.add_argument("--params", default="{}")
    parser.add_argument("--overridable", action="store_true", help="print the settings a fix may change")
    args = parser.parse_args()
    setup = json.loads(Path(args.case).read_text(encoding="utf-8"))["setup"]
    if args.overridable:
        print(json.dumps(overridable(setup)))
    elif not args.variant:
        parser.error("--variant is required")
    else:
        print(json.dumps(run(setup, args.variant, json.loads(args.params))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
