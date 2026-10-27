"""Scorecard: runs every labelled case through each mode and reports honest numbers.

    python3 scorecard/run_scorecard.py                         modes A, X, R (no agent needed)
    python3 scorecard/run_scorecard.py --import runs/worlds/full-<stamp> [--import ...]
                                                               grade Abhi's run-worlds result folders (no token needed here)
    python3 scorecard/run_scorecard.py --agent-cmd "CMD"       also Abhi's agent modes B, C, D, E
        CMD is run once per case and mode, with {world} and {mode} filled in, e.g.
        "npx tsx agent/src/cli.ts investigate --change {world} --mode {mode} --data data_layer --repo . --quiet"
        It must print the agent's run summary JSON (verdict, cause_claim, model_calls, experiments,
        duration_ms, outage, ...) before a line starting "Report:".

Modes
  A  static checks on the diff only (scorecard/mode_a.py)
  X  experiments only: runs baseline / candidate / control and reads `passed`; no evidence, no model
  R  reference script (scorecard/reference_investigator.py); written for World 1, model-free
  B  agent, model alone (no tools)           -> agent mode "no_tools"
  C  agent with context, no experiments      -> agent mode "no_experiments"
  D  full agent                              -> agent mode "full"
  E  full agent with the USL hidden          -> agent mode "no_usl"

Metrics, per mode, for practice worlds and the held-out world separately:
  correct, failures caught, false alarms on safe cases, inconclusive,
  explained cause (share of the true mechanism's key facts named; keyword-based, see the private labels),
  warnings backed by a reproduced failure, average time, average model calls,
  unavailable (outages are counted apart and excluded from accuracy).
Labels come only from the private folder. Results are written to runs/scorecard/<timestamp>/ (gitignored).
"""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import data_layer  # noqa: E402
import mode_a  # noqa: E402
import reference_investigator  # noqa: E402
import score as scoring  # noqa: E402
from data_layer.zetaris_client import ZetarisClient, ZetarisError  # noqa: E402

WARN = "reproduced_failure"
AGENT_MODES = {"B": "no_tools", "C": "no_experiments", "D": "full", "E": "no_usl"}
AGENT_TIMEOUT_S = 600  # the per-case budget: 10 minutes, then the case counts as unavailable


def cause_score(text: str, markers: list):
    """Share of the true mechanism's key facts the explanation names (None when the case has no markers)."""
    if not markers:
        return None
    low = (text or "").lower()
    return sum(1 for group in markers if any(m.lower() in low for m in group)) / len(markers)


def experiments_only(world: str) -> dict:
    started = time.monotonic()
    base = data_layer.run_experiment(world, "baseline")
    cand = data_layer.run_experiment(world, "candidate")
    ctrl = data_layer.run_experiment(world, "control") if cand.get("passed") is False else None
    if any(r.get("status") not in ("ok",) for r in (base, cand, ctrl) if r):
        return {"status": "unavailable", "duration_ms": int((time.monotonic() - started) * 1000)}
    if base["passed"] and cand["passed"] is False and ctrl and ctrl["passed"]:
        verdict = WARN
    elif base["passed"] and cand["passed"]:
        verdict = "no_failure_observed"
    else:
        verdict = "inconclusive"
    failed = [a["name"] for a in cand["assertions"] if not a["passed"]]
    explanation = (f"candidate failed {failed}; " if failed else "candidate passed; ") + " ".join(cand["logs"])
    return {"status": "ok", "verdict": verdict, "explanation": explanation, "model_calls": 0,
            "experiments": 3 if ctrl else 2, "backed": verdict == WARN,
            "duration_ms": int((time.monotonic() - started) * 1000)}


def static_checks(world: str) -> dict:
    started = time.monotonic()
    p = mode_a.predict(world)
    return {"status": "ok", "verdict": p["verdict"], "explanation": "rules fired: " + ", ".join(p["rules_fired"]),
            "model_calls": 0, "experiments": 0, "backed": False,
            "duration_ms": int((time.monotonic() - started) * 1000)}


def reference(world: str) -> dict:
    started = time.monotonic()
    r = reference_investigator.investigate(world, reference_investigator.Calls())
    findings = (r["prediction"] or {}).get("findings", [])
    parts = [f"{f['service'].rsplit('/', 1)[-1]} now reads {', '.join(t.rsplit('/', 1)[-1] for t in f['new_tables'])}: "
             f"{f['rows_now']}+{f['rows_added']} -> {f['expected_entries']} entries vs "
             f"{f['limit_setting'].rsplit('/', 1)[-1]}={f['limit']}" + (" (collapses same-name rows)" if f["output_collapses"] else "")
             for f in findings]
    if not parts:  # outside World 1 it falls back to what the experiments printed
        cand = r["metrics"].get("candidate") or {}
        parts = [f"experiment metrics: {json.dumps(cand)}"]
    return {"status": "ok", "verdict": r["verdict"], "explanation": "; ".join(parts), "model_calls": 0,
            "experiments": 3 if r["verdict"] == WARN else 2, "backed": r["verdict"] == WARN,
            "duration_ms": int((time.monotonic() - started) * 1000)}


def agent(cmd_template: str, mode_name: str):
    def run(world: str) -> dict:
        cmd = cmd_template.format(world=world, mode=mode_name)
        started = time.monotonic()
        try:
            proc = subprocess.run(shlex.split(cmd), cwd=ROOT, capture_output=True, text=True, timeout=AGENT_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            return {"status": "unavailable", "reason": f"over the {AGENT_TIMEOUT_S}s budget",
                    "duration_ms": AGENT_TIMEOUT_S * 1000}
        out = proc.stdout.split("\nReport:")[0]
        start = out.rfind("\n{")
        try:
            summary = json.loads(out[start + 1:] if start >= 0 else out)
        except json.JSONDecodeError:
            return {"status": "error", "reason": (proc.stderr or proc.stdout)[-400:],
                    "duration_ms": int((time.monotonic() - started) * 1000)}
        if summary.get("outage"):
            return {"status": "unavailable", "reason": "model provider outage", "summary": summary,
                    "duration_ms": summary.get("duration_ms")}
        return _agent_row(summary.get("verdict"), summary.get("model_prediction"), mode_name,
                          summary.get("cause_claim"), summary.get("model_calls"), summary.get("experiments"),
                          summary.get("duration_ms") or int((time.monotonic() - started) * 1000),
                          summary.get("all_calls_nemotron"), summary.get("cache_hits"), summary.get("run_id"))
    return run


PREDICTION_TO_VERDICT = {"breaks": WARN, "safe": "no_failure_observed", "unsure": "inconclusive"}
NO_EXPERIMENT_MODES = ("no_tools", "no_experiments")


def _agent_row(verdict, prediction, mode_name, cause, calls, experiments, duration_ms, nemotron, cache_hits, run_id):
    """Modes B and C run no experiments, so the judge can't decide; their answer is the model's own prediction,
    and a warning from them is never backed by a reproduced failure."""
    if mode_name in NO_EXPERIMENT_MODES:
        verdict, source = PREDICTION_TO_VERDICT.get(prediction or "", "inconclusive"), "model_prediction"
    else:
        source = "judge"
    return {"status": "ok", "verdict": verdict, "verdict_source": source, "explanation": cause or "",
            "model_calls": calls, "experiments": experiments or 0,
            "backed": verdict == WARN and source == "judge",  # the judge only says reproduced after baseline/candidate x2/control
            "all_calls_nemotron": nemotron, "cache_hits": cache_hits, "run_id": run_id, "duration_ms": duration_ms}


FOLDER_MODE = {"full": "D", "no_tools": "B", "no_experiments": "C", "no_usl": "E"}


def imported(folder: str):
    """Rows from one of Abhi's `run-worlds` result folders (results.json), so his runs can be graded here
    without his model token on this machine. The mode comes from each row, else the folder name (<mode>-<stamp>)."""
    path = Path(folder)
    rows = json.loads((path / "results.json").read_text(encoding="utf-8"))
    folder_mode = next((m for m in sorted(FOLDER_MODE, key=len, reverse=True) if path.name.startswith(m + "-")), None)
    by_world = {}
    for row in rows:
        mode_name = row.get("mode") or folder_mode
        if row.get("verdict") == "error":
            r = {"status": "error", "reason": row.get("error", ""), "explanation": ""}
        elif row.get("outage"):
            r = {"status": "unavailable", "reason": row.get("error") or "model provider outage"}
        else:
            r = _agent_row(row.get("verdict"), row.get("prediction"), mode_name, row.get("cause"), row.get("calls"),
                           row.get("experiments"), (row.get("secs") or 0) * 1000, row.get("nemotron"),
                           row.get("cache_hits"), row.get("run_id"))
        by_world.setdefault(row["world"], []).append(r)
    return FOLDER_MODE.get(folder_mode or "", "D"), by_world


def zetaris_up() -> dict:
    if data_layer.config.mode() != "live":
        return {"ok": True, "note": f"data mode {data_layer.config.mode()}, no Zetaris needed"}
    try:
        return ZetarisClient("agent").health()
    except ZetarisError as error:
        return {"ok": False, "error": str(error)}


def mark_independent(runs: list) -> int:
    """Repeats must be independent runs, or "3 runs" is really 1. The first run of a case always counts; a
    repeat counts only if its summary shows zero model cache hits and a run_id not seen before. Unknown cache
    status can't be confirmed, so that repeat is left out (n = 1). Returns how many runs count."""
    seen = set()
    for i, r in enumerate(runs):
        rid = r.get("run_id")
        fresh = r.get("cache_hits") == 0 and rid is not None and rid not in seen
        r["counted"] = i == 0 or r["status"] not in ("ok", "error") or fresh
        if not r["counted"]:
            r["not_counted_reason"] = ("same run as an earlier repeat" if rid in seen else
                                       "cache status unknown" if r.get("cache_hits") is None else "served partly from cache")
        if rid is not None:
            seen.add(rid)
    return sum(r["counted"] and r["status"] in ("ok", "error") for r in runs)


def summarize(rows: list, labels: dict) -> dict:
    # Outages (provider or Zetaris down) are excluded from accuracy; an agent crash or unreadable output
    # is the agent's own failure and counts as a wrong answer.
    dropped = sum(not r.get("counted", True) for r in rows)
    all_cache_hits = sum(r.get("cache_hits") or 0 for r in rows)  # including left-out repeats, so the reason shows
    rows = [r for r in rows if r.get("counted", True)]
    scored = [r for r in rows if r["status"] in ("ok", "error")]
    failing = [r for r in scored if labels[r["world"]]["expected_verdict"] == WARN]
    safe = [r for r in scored if labels[r["world"]]["expected_verdict"] != WARN]
    warnings = [r for r in scored if r.get("verdict") == WARN]
    causes = [r["cause"] for r in scored if r["cause"] is not None]
    fail_causes = [r["cause"] for r in failing if r["cause"] is not None]
    avg = lambda xs: round(sum(xs) / len(xs), 2) if xs else None  # noqa: E731
    return {
        "cases": len(rows), "scored": len(scored), "unavailable": len(rows) - len(scored),
        "errors": sum(r["status"] == "error" for r in rows),
        "correct": sum(r.get("verdict") == labels[r["world"]]["expected_verdict"] for r in scored),
        "caught": sum(r.get("verdict") == WARN for r in failing), "failing": len(failing),
        "false_alarms": sum(r.get("verdict") == WARN for r in safe), "safe": len(safe),
        "inconclusive": sum(r.get("verdict") == "inconclusive" for r in scored),
        "cause_all": avg(causes), "cause_failing": avg(fail_causes),
        "backed": sum(bool(r.get("backed")) for r in warnings), "warnings": len(warnings),
        "avg_seconds": avg([(r.get("duration_ms") or 0) / 1000 for r in scored]),
        "avg_model_calls": avg([r["model_calls"] for r in scored if r.get("model_calls") is not None]),
        "cache_hits": all_cache_hits,
        "repeats_not_independent": dropped,
    }


def fmt(s: dict) -> str:
    pct = lambda x: "-" if x is None else f"{x * 100:.0f}%"  # noqa: E731
    return (f"{s['correct']}/{s['scored']} correct | caught {s['caught']}/{s['failing']} | false alarms {s['false_alarms']}/{s['safe']}"
            f" | cause (failing) {pct(s['cause_failing'])} | backed {s['backed']}/{s['warnings']}"
            f" | {s['avg_seconds']}s | model calls {s['avg_model_calls']} | cache hits {s['cache_hits']}"
            f" | errors {s['errors']} | unavailable {s['unavailable']}"
            + (f" | repeats left out (not independent) {s['repeats_not_independent']}" if s.get("repeats_not_independent") else ""))


def main() -> int:
    parser = argparse.ArgumentParser(description="Domino scorecard")
    parser.add_argument("--modes", default="A,X,R", help="comma list of A,X,R,B,C,D,E")
    parser.add_argument("--agent-cmd", help="command template for the agent, with {world} and {mode}")
    parser.add_argument("--repeats", type=int, default=1, help="runs per case for agent modes (deterministic modes run once)")
    parser.add_argument("--worlds", help="comma list of world ids (default: every labelled world)")
    parser.add_argument("--import", dest="imports", action="append", default=[],
                        help="a run-worlds result folder from the agent (repeatable); graded instead of running it")
    args = parser.parse_args()

    labels = scoring.labels()
    worlds = args.worlds.split(",") if args.worlds else sorted(set(labels) & set(data_layer.list_worlds()))
    modes = [m.strip() for m in args.modes.split(",") if m.strip()]
    if args.agent_cmd and args.modes == "A,X,R":
        modes += list(AGENT_MODES)
    runners = {"A": static_checks, "X": experiments_only, "R": reference}
    for m, name in AGENT_MODES.items():
        if args.agent_cmd:
            runners[m] = agent(args.agent_cmd, name)
    imports = {}
    for folder in args.imports:
        letter, by_world = imported(folder)
        for world, rs_ in by_world.items():
            imports.setdefault(letter, {}).setdefault(world, []).extend(rs_)
    if imports:
        modes = [m for m in modes if m not in imports] + sorted(imports)
    missing = [m for m in modes if m not in runners and m not in imports]
    if missing:
        print(f"Skipping {missing}: pass --agent-cmd to run the agent modes.")
        modes = [m for m in modes if m in runners or m in imports]

    stamp = time.strftime("%Y%m%d-%H%M%S")
    out_dir = ROOT / "runs" / "scorecard" / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    results = {"generated_at": stamp, "data_mode": data_layer.config.mode(), "worlds": worlds, "modes": {}}
    for m in modes:
        repeats = args.repeats if m in AGENT_MODES else 1
        health = {"ok": True, "note": "imported results"} if m in imports else zetaris_up()
        rows = []
        for world in worlds:
            if m in imports:
                runs = imports[m].get(world) or [{"status": "unavailable", "reason": "not in the imported results"}]
            else:
                runs = [runners[m](world) if health.get("ok") else {"status": "unavailable", "reason": "Zetaris health check failed"}
                        for _ in range(repeats)]
            independent = mark_independent(runs)
            for rep, r in enumerate(runs):
                r.update(world=world, repeat=rep, held_out=bool(labels[world].get("held_out")), independent_runs=independent)
                markers = labels[world].get("cause_markers")
                r["cause"] = cause_score(r.get("explanation", ""), markers) if r["status"] in ("ok", "error") else None
                rows.append(r)
        groups = {"practice worlds": [r for r in rows if not r["held_out"]], "held-out world": [r for r in rows if r["held_out"]]}
        results["modes"][m] = {"health_before_batch": health, "rows": rows,
                               "summary": {g: summarize(rs, labels) for g, rs in groups.items() if rs}}
        n_per_case = [next(r["independent_runs"] for r in rows if r["world"] == w) for w in worlds]
        results["modes"][m]["independent_runs_per_case"] = {"min": min(n_per_case), "max": max(n_per_case)}
        if max(n_per_case) > 1:
            verdicts = {}
            for r in rows:
                if r["counted"] and r["status"] in ("ok", "error"):
                    verdicts.setdefault(r["world"], set()).add(r.get("verdict"))
            results["modes"][m]["repeat_agreement"] = sum(len(v) == 1 for v in verdicts.values()) / len(verdicts)
        print(f"\nMode {m}")
        for g, s in results["modes"][m]["summary"].items():
            print(f"  {g:16} {fmt(s)}")
        if repeats > 1 or m in imports:
            lo, hi = min(n_per_case), max(n_per_case)
            agree = results["modes"][m].get("repeat_agreement")
            print(f"  independent runs per case: n = {lo}" + (f"-{hi}" if hi != lo else "")
                  + (" (0 = no usable run for that case)" if lo == 0 else "")
                  + (f" | repeats agree on {agree * 100:.0f}% of cases" if agree is not None else ""))

    (out_dir / "results.json").write_text(json.dumps(results, indent=2, default=str) + "\n", encoding="utf-8")
    print(f"\nSaved {out_dir / 'results.json'}")
    print("Cause scores are keyword-based (the private labels list each mechanism's key facts); treat them as a proxy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
