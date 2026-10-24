"""Abuse test: bad input to any data-layer call must come back as a clean result, never a crash or a hang.

Runs every case in fake, sample and live mode. Live mode points at a closed port, so no Zetaris is needed.
Each result must have a known status, the call's full field set, and return within a few seconds.

    python3 -I tests/test_abuse.py
"""

from __future__ import annotations

import os
import pathlib
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
TMP = pathlib.Path(tempfile.mkdtemp(prefix="domino-abuse-"))
for key in [k for k in os.environ if k.startswith(("ZETARIS_", "DOMINO_"))]:
    del os.environ[key]
os.environ.update(DOMINO_QUERY_LOG=str(TMP / "qlog.jsonl"), DOMINO_PRIVATE_DIR=str(TMP / "private"),
                  ZETARIS_BASE_URL="http://127.0.0.1:9", ZETARIS_ORG_ID="1", ZETARIS_TIMEOUT_S="2",
                  ZETARIS_AGENT_USERNAME="abuse-agent", ZETARIS_AGENT_PASSWORD="not-real")

from data_layer import describe_world, dependency_path, lookup, lookups, run_experiment, zetaris_client  # noqa: E402
from data_layer.experiments import DESCRIBE_FIELDS, RUN_FIELDS  # noqa: E402

zetaris_client.RETRY_BACKOFF_S = (0.05, 0.05)
STATUSES = {"ok", "error", "timeout", "unavailable", "not_in_sample"}
FIELDS = {"lookup": set(lookups.FIELDS["lookup"]), "dependency_path": set(lookups.FIELDS["dependency_path"]),
          "run_experiment": set(RUN_FIELDS), "describe_world": set(DESCRIBE_FIELDS)}
CASES = [
    ("lookup(None)", lambda: lookup(None)), ("lookup('')", lambda: lookup("")), ("lookup(123)", lambda: lookup(123)),
    ("lookup(write)", lambda: lookup("DROP TABLE x")), ("lookup(two statements)", lambda: lookup("SELECT 1; SELECT 2")),
    ("lookup(limit=-5)", lambda: lookup("SELECT 1", limit=-5)), ("lookup(limit='x')", lambda: lookup("SELECT 1", limit="x")),
    ("lookup(limit=True)", lambda: lookup("SELECT 1", limit=True)),
    ("lookup(huge sql)", lambda: lookup("SELECT " + "1," * 20000 + "1")),
    ("lookup(timeout=-1)", lambda: lookup("SELECT 1", timeout_s=-1)), ("lookup(timeout='x')", lambda: lookup("SELECT 1", timeout_s="x")),
    ("path(None)", lambda: dependency_path(None)), ("path('')", lambda: dependency_path("")), ("path(42)", lambda: dependency_path(42)),
    ("path(natural language)", lambda: dependency_path("bundle builder service")),
    ("path(injection)", lambda: dependency_path("w-k7m2/change/x' OR '1'='1")),
    ("path(max_hops=-1)", lambda: dependency_path("w-k7m2/change/0042", max_hops=-1)),
    ("path(max_hops='x')", lambda: dependency_path("w-k7m2/change/0042", max_hops="x")),
    ("path(unknown system)", lambda: dependency_path("w-zzzz/change/0042")),
    ("run(None, None)", lambda: run_experiment(None, None)), ("run(variant='CANDIDATE')", lambda: run_experiment("w-k7m2", "CANDIDATE")),
    ("run(params='abc')", lambda: run_experiment("w-k7m2", "baseline", params="abc")),
    ("run(params=[1])", lambda: run_experiment("w-k7m2", "baseline", params=[1])),
    ("run(params with object)", lambda: run_experiment("w-k7m2", "baseline", params={"x": object()})),
    ("run(unknown param)", lambda: run_experiment("w-k7m2", "baseline", params={"x": 1})),
    ("run(timeout=-1)", lambda: run_experiment("w-k7m2", "baseline", timeout_s=-1)),
    ("run(timeout='x')", lambda: run_experiment("w-k7m2", "baseline", timeout_s="x")),
    ("run(path traversal)", lambda: run_experiment("../../etc", "baseline")),
    ("describe(None)", lambda: describe_world(None)), ("describe(path traversal)", lambda: describe_world("../../etc/passwd")),
]


def main() -> int:
    failures = 0
    for mode in ("fake", "sample", "live"):
        os.environ["DOMINO_DATA_MODE"] = mode
        lookups._agent = None
        for name, fn in CASES:
            started = time.monotonic()
            try:
                result = fn()
            except Exception as error:  # the whole point: nothing may raise
                failures += 1
                print(f"FAIL [{mode}] {name}: raised {type(error).__name__}: {error}")
                continue
            elapsed = time.monotonic() - started
            missing = FIELDS[result.get("call", "")] - set(result) if result.get("call") in FIELDS else {"call"}
            problems = []
            if result.get("status") not in STATUSES:
                problems.append(f"status {result.get('status')!r}")
            if missing:
                problems.append(f"missing fields {sorted(missing)}")
            if result.get("status") != "ok" and not result.get("error"):
                problems.append("no error message")
            if elapsed > 8:
                problems.append(f"took {elapsed:.1f}s")
            if problems:
                failures += 1
                print(f"FAIL [{mode}] {name}: {'; '.join(problems)}")
    total = 3 * len(CASES)
    print(f"\n{total - failures}/{total} abuse cases handled cleanly")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
