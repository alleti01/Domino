"""Reference investigator: a plain script (no model) that solves a case using ONLY the agent's interfaces.

It proves each world is solvable from what the agent may see, and it times every call.
It is written knowing World 1's mechanism, so it is a solvability check and a speed baseline,
not a fair competitor: expect it to fail on worlds it was not written for.

  1. describe_world  -> the changed entity
  2. dependency_path -> the cross-source chain from Zetaris
  3. predict from the data alone: newly readable tables, output size, downstream limits
  4. run_experiment  -> baseline, candidate, and (if the candidate fails) control
  5. verdict: reproduced_failure needs baseline pass + candidate fail + control pass

    python3 scorecard/reference_investigator.py     (uses DOMINO_DATA_MODE; live or sample)
"""

from __future__ import annotations

import re
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import data_layer  # noqa: E402
import score as scoring  # noqa: E402

_NUM = re.compile(r"^(\w+)=(\d+)$")


class Calls:
    """Wraps the agent interfaces to count calls and time them."""

    def __init__(self):
        self.count, self.seconds = defaultdict(int), defaultdict(float)

    def __call__(self, name, *args, **kwargs):
        started = time.monotonic()
        try:
            return getattr(data_layer, name)(*args, **kwargs)
        finally:
            self.count[name] += 1
            self.seconds[name] += time.monotonic() - started


def predict_from_data(paths: list) -> dict:
    hops = list({(h["from"], h["relation"], h["to"]): h for p in paths for h in p["hops"]}.values())
    granted_dbs = {h["to"].rsplit("/", 1)[1] for h in hops if h["relation"] == "grants_on"}
    granted_principals = {h["to"] for h in hops if h["relation"] == "grants_to"}
    services = {h["to"] for h in hops if h["relation"] == "identity_of" and h["from"] in granted_principals}
    columns = {h["to"]: int(m.group(2)) for h in hops if h["relation"] == "contains"
               for m in [_NUM.match(h["detail"] or "")] if m}
    findings = []
    for service in sorted(services):
        reads = [h["to"] for h in hops if h["relation"] == "reads" and h["from"] == service]
        new_tables = [t for t in reads if t.rsplit("/", 1)[1].split(".", 1)[0] in granted_dbs]
        if not new_tables:
            continue
        rows_now = next((int(x) for h in hops if h["relation"] == "executes" and h["from"] == service
                         for x in re.findall(r"rows_returned_p50=(\d+)", h["detail"] or "")), None)
        added = sum(columns.get(t, 0) for t in new_tables)
        for write in (h for h in hops if h["relation"] == "writes" and h["from"] == service):
            collapses = "collapse_same_name" in (write["detail"] or "")
            expected = rows_now if collapses else (rows_now or 0) + added
            consumers = {h["to"] for h in hops if h["relation"] == "loaded_by" and h["from"] == write["to"]}
            limits = {h["to"]: int(m.group(2)) for h in hops if h["relation"] == "configured_with"
                      and h["from"] in consumers for m in [_NUM.match(h["detail"] or "")]
                      if m and m.group(1).startswith("max_")}
            for setting, limit in sorted(limits.items()):
                findings.append({"service": service, "new_tables": new_tables, "rows_now": rows_now,
                                 "rows_added": added, "output_collapses": collapses, "expected_entries": expected,
                                 "limit_setting": setting, "limit": limit, "exceeds": expected > limit})
    return {"findings": findings, "predicts_failure": any(f["exceeds"] for f in findings)}


def investigate(world: str, calls: Calls) -> dict:
    described = calls("describe_world", world)
    entity = (described.get("change") or {}).get("entity_id")
    path = calls("dependency_path", entity) if entity else {"status": "error", "paths": []}
    prediction = predict_from_data(path.get("paths", [])) if path.get("status") == "ok" else None

    base = calls("run_experiment", world, "baseline")
    cand = calls("run_experiment", world, "candidate")
    ctrl = calls("run_experiment", world, "control") if cand.get("passed") is False else None
    if base.get("passed") and cand.get("passed") is False and ctrl and ctrl.get("passed"):
        verdict = "reproduced_failure"
    elif base.get("passed") and cand.get("passed"):
        verdict = "no_failure_observed"
    else:
        verdict = "inconclusive"
    return {"verdict": verdict, "path_status": path.get("status"), "prediction": prediction,
            "data_agrees_with_experiment": prediction is not None and prediction["predicts_failure"] == (verdict == "reproduced_failure"),
            "metrics": {"baseline": base.get("metrics"), "candidate": cand.get("metrics")}}


def main() -> int:
    calls, results, per_case_s = Calls(), {}, {}
    for world in data_layer.list_worlds():
        started = time.monotonic()
        results[world] = investigate(world, calls)
        per_case_s[world] = time.monotonic() - started
        r, f = results[world], (results[world]["prediction"] or {}).get("findings", [])
        detail = "; ".join(f"{x['rows_now']}+{x['rows_added']}{' (collapsed)' if x['output_collapses'] else ''}"
                           f" -> {x['expected_entries']} vs {x['limit_setting'].rsplit('/', 1)[1]}={x['limit']}" for x in f)
        print(f"{world}: {r['verdict']:20} data predicts failure={r['prediction'] and r['prediction']['predicts_failure']}"
              f" | agrees with experiment={r['data_agrees_with_experiment']} | {detail} | {per_case_s[world]:.1f}s")
    scoring.print_table(f"Reference investigator (mode={data_layer.config.mode()})", scoring.score(results))
    # Causal correctness: do the numbers it derived from the data match the true mechanism?
    truth = scoring.labels()
    print("\nCausal check (numbers derived from Zetaris data vs ground truth):")
    for world, r in sorted(results.items()):
        facts, findings = truth.get(world, {}).get("key_facts", {}), (r["prediction"] or {}).get("findings", [])
        got = (findings[0]["expected_entries"], findings[0]["limit"]) if findings else (None, None)
        want = (facts.get("entries_after_change"), facts.get("max_entries"))
        print(f"  {'ok' if got == want else 'XX'} {world}: entries/limit derived {got} vs true {want}")
    print("\nCalls per case (average) and time:")
    n = len(results) or 1
    for name in sorted(calls.count):
        print(f"  {name:16} {calls.count[name] / n:.1f} calls/case, {calls.seconds[name] / calls.count[name]:.2f}s per call")
    print(f"  total            {sum(per_case_s.values()) / n:.1f}s per case (no model calls)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
