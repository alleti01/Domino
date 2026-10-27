"""traffic: writes the request arrival schedule for one run (evenly spaced, with periodic bursts).

    python3 traffic.py --profile <profile.json> --out <arrivals.json>
"""

from __future__ import annotations

import argparse
import json
import sys


def arrivals(p: dict) -> list:
    """Arrival times in ms. Base rate all the time; the burst rate during each burst window."""
    out, t, step = [], 0.0, 1.0  # 1 ms ticks, fractional accumulation keeps it deterministic
    owed = 0.0
    while t < p["duration_s"] * 1000:
        offset = (t / 1000) % p["burst_every_s"]
        in_burst = p["burst_start_s"] <= offset < p["burst_start_s"] + p["burst_s"]
        owed += (p["burst_rps"] if in_burst else p["base_rps"]) / 1000.0
        while owed >= 1.0:
            out.append(t)
            owed -= 1.0
        t += step
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    profile = json.load(open(args.profile, encoding="utf-8"))
    times = arrivals(profile)
    json.dump(times, open(args.out, "w", encoding="utf-8"))
    print(f"generated {len(times)} requests over {profile['duration_s']} s", file=sys.stderr)
    print(json.dumps({"requests": len(times)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
