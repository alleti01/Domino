"""One clean JSON per world for the dashboard's "what the system did" screens. Not an agent tool.

It runs all three variants (baseline, candidate, control) and lays the results out by component, so a
screen can show the system before the change, with it, and with it reverted. Because that shows each
world's outcome directly, it must never be exposed to the agent: it is not in the data_layer package,
and by default it writes to runs/demo_views/ (git-ignored), never into tracked files.

    python3 worlds/demo_view.py w-k7m2                 print one world
    python3 worlds/demo_view.py --all                  write every released world to runs/demo_views/<world>.json
    python3 worlds/demo_view.py --all --out DIR        write them somewhere else (outside this repo)

Output (every world has the same fields):
  world, title, synthetic        the world and its change title; synthetic is always true
  change                         entity_id, title, description, files, diff (what the PR changes)
  components[]                   name, role, plus per variant: metrics (short names) and log lines
  variants[]                     variant, label, passed, failed_checks[], checks[] (name/passed/observed/expected),
                                 other_logs[] (log lines that name no component)
  changed_metrics[]              component, metric, baseline, candidate, control: only metrics that differ
  dependency                     nodes[] and edges[] from Zetaris (relation, edge_status, detail, evidence rows),
                                 or status "not_available" when that path isn't in sample mode
  reproduce                      the command for each variant
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_layer import config, dependency_path, describe_world, list_worlds, run_experiment  # noqa: E402

VARIANTS = ("baseline", "candidate", "control")
DEFAULT_OUT = ROOT / "runs" / "demo_views"


def _split(name: str) -> tuple:
    """"worker-runtime.exit_code" -> ("worker-runtime", "exit_code"); log lines split on the first ': '."""
    head, sep, tail = name.partition(".")
    return (head, tail) if sep else ("", name)


def _dependency(entity_id: str) -> dict:
    result = dependency_path(entity_id)
    if result.get("status") != "ok":
        return {"status": "not_available", "reason": result.get("error") or result.get("status")}
    nodes, edges, seen = {}, [], set()
    for path in result["paths"]:
        for hop in path["hops"]:
            nodes.setdefault(hop["from"], hop["from_type"])
            nodes.setdefault(hop["to"], hop["to_type"])
            key = (hop["from"], hop["relation"], hop["to"])
            if key not in seen:
                seen.add(key)
                edges.append({k: hop[k] for k in ("from", "to", "relation", "edge_status", "detail", "evidence")})
    return {"status": "ok", "mode": result.get("mode"), "nodes": [{"id": n, "type": t} for n, t in nodes.items()],
            "edges": edges, "unresolved": result.get("unresolved", [])}


def build(world: str) -> dict:
    described = describe_world(world)
    if described.get("status") != "ok":
        raise SystemExit(f"{world}: {described.get('error') or described.get('status')}")
    runs = {v: run_experiment(world, v) for v in VARIANTS}
    failed = [v for v, r in runs.items() if r.get("status") != "ok"]
    if failed:
        raise SystemExit(f"{world}: variant(s) {failed} did not run: {[runs[v].get('error') for v in failed]}")

    components = [{"name": c["name"], "role": c["role"], "by_variant": {}} for c in described["components"]]
    by_name = {c["name"]: c for c in components}
    other_logs = {}
    for variant, run in runs.items():
        for c in components:
            c["by_variant"][variant] = {"metrics": {}, "logs": []}
        for metric, value in run["metrics"].items():
            comp, short = _split(metric)
            if comp in by_name:
                by_name[comp]["by_variant"][variant]["metrics"][short] = value
        for line in run.get("logs", []):
            comp, _, text = line.partition(": ")
            if comp in by_name:
                by_name[comp]["by_variant"][variant]["logs"].append(text)
            else:
                other_logs.setdefault(variant, []).append(line)

    changed = []
    for metric in described["metrics"]:
        values = {v: runs[v]["metrics"].get(metric) for v in VARIANTS}
        if len({json.dumps(x) for x in values.values()}) > 1:
            comp, short = _split(metric)
            changed.append({"component": comp, "metric": short, **values})

    return {
        "world": world, "title": described["title"], "synthetic": True,
        "change": described["change"],
        "components": components,
        "variants": [{"variant": v, "label": described["variants"][v], "passed": runs[v]["passed"],
                      "failed_checks": [a["name"] for a in runs[v]["assertions"] if not a["passed"]],
                      "checks": runs[v]["assertions"], "other_logs": other_logs.get(v, [])} for v in VARIANTS],
        "changed_metrics": changed,
        "dependency": _dependency(described["change"]["entity_id"]),
        "reproduce": {v: runs[v]["reproduce"]["command"] for v in VARIANTS},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("world", nargs="?", help="one world id (prints it)")
    parser.add_argument("--all", action="store_true", help="every released world, written to --out")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help=f"folder for --all (default {DEFAULT_OUT})")
    args = parser.parse_args()
    if bool(args.world) == args.all:
        parser.error("give one world id, or --all")
    if args.world:
        print(json.dumps(build(args.world), indent=2))
        return 0

    out = Path(args.out).expanduser().resolve()
    tracked_area = ROOT in out.parents or out == ROOT
    if tracked_area and DEFAULT_OUT.resolve() not in (out, *out.parents):
        raise SystemExit(f"Refusing to write inside the repo outside runs/: {out}. These files show each world's "
                         "outcome, so they stay out of tracked files.")
    held_out = set(config.private_world_ids())
    worlds = [w for w in list_worlds() if w not in held_out]  # unreleased worlds are never written out
    out.mkdir(parents=True, exist_ok=True)
    for world in worlds:
        view = build(world)
        (out / f"{world}.json").write_text(json.dumps(view, indent=2) + "\n", encoding="utf-8")
        print(f"  {world}: {len(view['components'])} components, {len(view['changed_metrics'])} changed metrics, "
              f"dependency {view['dependency']['status']}")
    print(f"Wrote {len(worlds)} views to {out}" + (f" ({len(held_out)} unreleased world(s) left out)" if held_out else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
