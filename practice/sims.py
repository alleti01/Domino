"""Deterministic simulations behind run_experiment for the practice scenarios.

Each takes the scenario's sim spec plus the active settings (before or after the change) and returns
(metrics, assertions, logs). Pure functions: same input, same output, no clock, no network.
"""

from __future__ import annotations

from datetime import datetime, timedelta


def _spread(n: int, p50: float, p95_or_p99: float, at: float) -> list:
    """n deterministic values rising linearly so that value[at * (n - 1)] == p95_or_p99, starting near p50."""
    top = at * (n - 1)
    return [p50 + (p95_or_p99 - p50) * (i / top) * 0.98 for i in range(n)]


def redelivery(spec: dict, s: dict):
    times = _spread(spec["messages"], spec["p50_ms"], spec["p95_ms"], 0.95)
    redelivered = sum(1 for t in times if t > s["ack_timeout_ms"])
    duplicates = 0 if spec["idempotent"] else redelivered
    metrics = {"queue.messages": len(times), "queue.redeliveries": redelivered, "consumer.duplicate_side_effects": duplicates}
    ok = duplicates == 0
    return metrics, [{"name": "no_duplicate_side_effects", "passed": ok, "observed": duplicates, "expected": 0}], [
        f"queue: ack timeout {s['ack_timeout_ms']} ms; {redelivered} of {len(times)} messages redelivered",
        f"consumer: {duplicates} side effects applied more than once"]


def pool(spec: dict, s: dict):
    wanted = s["replicas"] * spec["pool_size"]
    refused = max(0, wanted - spec["max_connections"])
    metrics = {"api.replicas": s["replicas"], "api.connections_requested": wanted, "db.connections_refused": refused}
    return metrics, [{"name": "all_replicas_get_connections", "passed": refused == 0, "observed": refused, "expected": 0}], [
        f"api: {s['replicas']} replicas request {wanted} connections", f"db: refused {refused} connections"]


def format(spec: dict, s: dict):  # noqa: A001 - matches the sim type name
    start, failed = datetime(2026, 10, 24, 8, 0, 0), 0
    for i in range(spec["events"]):
        text = (start + timedelta(minutes=7 * i)).strftime(s["producer_format"])
        try:
            datetime.strptime(text, spec["consumer_format"])
        except ValueError:
            failed += 1
    metrics = {"producer.events": spec["events"], "consumer.parse_failures": failed}
    return metrics, [{"name": "consumer_parses_all_events", "passed": failed == 0, "observed": failed, "expected": 0}], [
        f"producer: format {s['producer_format']}", f"consumer: {failed} of {spec['events']} events failed to parse"]


def retry(spec: dict, s: dict):
    # During the daily brownout, each failed request is retried; without backoff the retries land at once.
    spread = 0.5 if s["backoff"] else 1.0
    load = spec["base_rps"] * (1 + spec["error_rate"] * s["max_retries"] * spread)
    throttled = max(0.0, load - spec["rate_limit_rps"])
    metrics = {"client.peak_rps_during_brownout": round(load, 1), "gateway.throttled_rps": round(throttled, 1)}
    return metrics, [{"name": "upstream_within_rate_limit", "passed": throttled == 0, "observed": round(load, 1),
                      "expected": f"<= {spec['rate_limit_rps']}"}], [
        f"client: max_retries={s['max_retries']} backoff={s['backoff']} -> peak {load:.1f} rps",
        f"gateway: throttled {throttled:.1f} rps"]


def disk(spec: dict, s: dict):
    rate = spec["info_mb_per_hour"] * (spec["debug_multiplier"] if s["level"] == "DEBUG" else 1)
    used = rate * spec["rotation_hours"]
    full_after = spec["free_mb"] / rate
    metrics = {"service.log_mb_per_hour": rate, "node.mb_written_before_rotation": used,
               "node.hours_until_disk_full": round(full_after, 2)}
    ok = used <= spec["free_mb"]
    return metrics, [{"name": "disk_not_full_before_rotation", "passed": ok, "observed": used,
                      "expected": f"<= {spec['free_mb']} MB"}], [
        f"service: logging at {s['level']} writes {rate} MB/h", f"node: disk full after {full_after:.2f} h"]


def timeout(spec: dict, s: dict):
    n = spec["requests"]
    latencies = _spread(n - 1, spec["p50_ms"], spec["p99_ms"], 0.99) + [spec["max_ms"]]
    timed_out = sum(1 for t in latencies if t > s["timeout_ms"])
    rate = timed_out / n
    metrics = {"client.requests": n, "client.timeouts": timed_out, "client.error_rate": round(rate, 4)}
    return metrics, [{"name": "error_rate_below_1pct", "passed": rate < 0.01, "observed": round(rate, 4),
                      "expected": "< 0.01"}], [f"client: timeout {s['timeout_ms']} ms; {timed_out} of {n} timed out"]


def overlap(spec: dict, s: dict):
    starts = list(range(0, spec["window_minutes"], s["interval_minutes"]))
    overlapping, busy_until = 0, -1
    for start in starts:
        if start < busy_until and not spec["has_lock"]:
            overlapping += 1
        busy_until = max(busy_until, start + spec["run_minutes"])
    metrics = {"job.runs": len(starts), "job.overlapping_runs": overlapping}
    return metrics, [{"name": "no_overlapping_runs", "passed": overlapping == 0, "observed": overlapping, "expected": 0}], [
        f"job: every {s['interval_minutes']} min, {spec['run_minutes']} min per run, {overlapping} overlapping runs"]


def schema_add(spec: dict, s: dict):
    columns = ["id", "customer_id", "total"] + (["promo_code"] if s["has_new_column"] else [])
    wanted = ["id", "customer_id", "total"]
    failures = 0 if spec["consumers_use_explicit_columns"] or columns == wanted else spec["rows"]
    metrics = {"db.columns": len(columns), "consumers.read_failures": failures}
    return metrics, [{"name": "consumers_read_all_rows", "passed": failures == 0, "observed": failures, "expected": 0}], [
        f"db: orders has {len(columns)} columns", f"consumers: {failures} read failures"]


SIMS = {"redelivery": redelivery, "pool": pool, "format": format, "retry": retry, "disk": disk,
        "timeout": timeout, "overlap": overlap, "schema_add": schema_add}
