"""api-gateway in front of order-service, simulated event by event (deterministic, no wall clock).

    python3 serve.py --arrivals <arrivals.json> --config <config.json>

order-service handles each attempt on one of `workers` workers, first come first served, taking
`service_time_ms`. api-gateway gives each attempt `timeout_ms`; on a timeout it retries, up to
`max_retries` times. order-service does not cancel an attempt the gateway has given up on.
"""

from __future__ import annotations

import argparse
import collections
import heapq
import itertools
import json
import sys


def simulate(times: list, c: dict) -> dict:
    events, seq = [], itertools.count()
    queue, free = collections.deque(), c["workers"]
    done = {}      # request -> latency ms (success) or None (failed)
    attempts = {}  # attempt id -> [request, n, finished, given_up]
    handled = retries = max_depth = 0
    depth_samples = {}
    for r, t in enumerate(times):
        heapq.heappush(events, (t, next(seq), "arrive", r))

    def issue(now, r, n):
        nonlocal max_depth
        a = next(seq)
        attempts[a] = [r, n, False, False]
        queue.append(a)
        max_depth = max(max_depth, len(queue))
        heapq.heappush(events, (now + c["timeout_ms"], next(seq), "timeout", a))
        dispatch(now)

    def dispatch(now):
        nonlocal free
        while free and queue:
            a = queue.popleft()
            free -= 1
            heapq.heappush(events, (now + c["service_time_ms"], next(seq), "finish", a))

    start = {}
    while events:
        now, _, kind, x = heapq.heappop(events)
        second = int(now // 1000)
        depth_samples.setdefault(second, len(queue))
        if kind == "arrive":
            start[x] = now
            issue(now, x, 0)
        elif kind == "finish":
            free += 1
            handled += 1
            r, _, _, given_up = attempts[x]
            attempts[x][2] = True
            if not given_up and r not in done:
                done[r] = now - start[r]
            dispatch(now)
        else:  # timeout
            r, n, finished, _ = attempts[x]
            if finished or r in done:
                continue
            attempts[x][3] = True
            if n < c["max_retries"]:
                retries += 1
                issue(now, r, n + 1)
            else:
                done[r] = None
    ok = sorted(v for v in done.values() if v is not None)
    end_s = int(times[-1] // 1000) if times else 0
    return {"requests": len(times), "succeeded": len(ok), "failed": len(times) - len(ok), "retries": retries,
            "attempts_handled": handled, "max_queue_depth": max_depth,
            "queue_depth_at_end": depth_samples.get(end_s, 0),
            "p99_latency_ms": round(ok[int(0.99 * (len(ok) - 1))], 1) if ok else None,
            "queue_by_second": depth_samples}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--arrivals", required=True)
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    times = json.load(open(args.arrivals, encoding="utf-8"))
    config = json.load(open(args.config, encoding="utf-8"))
    s = simulate(times, config)
    log = sys.stderr
    print(f"order-service: {config['workers']} workers, {config['service_time_ms']} ms per attempt; "
          f"handled {s['attempts_handled']} attempts", file=log)
    for second in sorted(s["queue_by_second"])[::10]:
        print(f"order-service: queue depth at t={second}s: {s['queue_by_second'][second]}", file=log)
    print(f"order-service: max queue depth {s['max_queue_depth']}", file=log)
    print(f"api-gateway: timeout {config['timeout_ms']} ms, up to {config['max_retries']} retries; "
          f"{s['retries']} retries sent", file=log)
    print(f"api-gateway: {s['requests']} requests, {s['succeeded']} succeeded, {s['failed']} failed", file=log)
    s.pop("queue_by_second")
    print(json.dumps(s))
    return 0


if __name__ == "__main__":
    sys.exit(main())
