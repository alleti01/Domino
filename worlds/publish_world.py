"""Publishes held-out worlds from the private folder into the repo (run once, at the freeze, when told to).

What a release does, in a target checkout:
  1. copies each world's case file to worlds/cases/ and its engine to worlds/engines/<engine>/
  2. lists the worlds in worlds/load_order.txt, so their source rows still load last and every
     existing source_row_id (cited by snapshots and recordings) stays the same
  3. copies their private Zetaris snapshots, and the full data-quality report, into zetaris/snapshots/
  4. rebuilds zetaris/sources/ and checks it is byte-identical to the private set Zetaris already loads
Ground-truth labels are never published by this script.

    python3 worlds/publish_world.py              plan only (default): prints what would change, writes nothing
    python3 worlds/publish_world.py --rehearse   full release in a throwaway clone of HEAD, then the tests
                                                 and leakage check there; the repo and private folder are untouched
    python3 worlds/publish_world.py --apply      the real release into this checkout; afterwards moves the
                                                 released files in the private folder to released/<stamp>/
                                                 (nothing is deleted). Commit by hand after reviewing.
"""

from __future__ import annotations

import argparse
import filecmp
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data_layer import config  # noqa: E402

CHECKS = [
    ["tests/test_data_layer.py"], ["tests/test_abuse.py"], ["contracts/make_samples.py", "--check"],
    ["scorecard/leakage_check.py"], ["scorecard/reference_investigator.py"],
]


def plan(private: Path) -> dict:
    """Which private files a release would copy, and where. Raises SystemExit if there is nothing to publish."""
    cases = sorted((private / "worlds" / "cases").glob("*.json"))
    if not cases:
        raise SystemExit(f"No held-out worlds in {private / 'worlds' / 'cases'}; nothing to publish.")
    worlds = [p.stem for p in cases]
    engines = sorted({json.loads(p.read_text(encoding="utf-8"))["engine"] for p in cases})
    snap_dir = private / "zetaris" / "snapshots"
    snapshots = [p for p in sorted(snap_dir.rglob("*.json")) if p.name != "dq_report.json"
                 and any(w in p.read_text(encoding="utf-8") for w in worlds)]
    copies = [(p, Path("worlds/cases") / p.name) for p in cases]
    for engine in engines:
        src = private / "worlds" / "engines" / engine
        if not src.is_dir():
            raise SystemExit(f"Engine {engine!r} is not in {src.parent}")
        copies += [(p, Path("worlds/engines") / engine / p.relative_to(src)) for p in sorted(src.rglob("*"))
                   if p.is_file() and "__pycache__" not in p.parts]
    copies += [(p, Path("zetaris/snapshots") / p.relative_to(snap_dir)) for p in snapshots]
    if (snap_dir / "dq_report.json").is_file():
        copies.append((snap_dir / "dq_report.json", Path("zetaris/snapshots/dq_report.json")))
    return {"worlds": worlds, "engines": engines, "copies": copies}


def show(p: dict, target: Path) -> None:
    print(f"Release {len(p['worlds'])} world(s): {', '.join(p['worlds'])} (engine {', '.join(p['engines'])})")
    for src, rel in p["copies"]:
        state = "replace" if (target / rel).exists() else "add"
        print(f"  {state:7} {rel}")
    print(f"  append  worlds/load_order.txt: {', '.join(p['worlds'])}")
    print("  rebuild zetaris/sources/*.csv, then check them against the private set")
    print("  not published: ground-truth labels")


def release(p: dict, target: Path, private: Path) -> list:
    """Copies the files into target and rebuilds its sources. Returns the source CSVs that differ from
    the private set (empty = every row ID unchanged)."""
    for src, rel in p["copies"]:
        (target / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target / rel)
    order = target / "worlds" / "load_order.txt"
    lines = order.read_text(encoding="utf-8").splitlines() if order.is_file() else [
        "# Worlds published after the first release, in the order their source rows load (after the",
        "# data-quality demo rows). Keeps every source_row_id unchanged. Written by worlds/publish_world.py."]
    order.write_text("\n".join(lines + [w for w in p["worlds"] if w not in lines]) + "\n", encoding="utf-8")
    env = {**os.environ, "DOMINO_PRIVATE_DIR": str(target / ".no-private")}  # build as if nothing were held out
    subprocess.run([sys.executable, "zetaris/build_sources.py"], cwd=target, env=env, check=True,
                   stdout=subprocess.DEVNULL, timeout=300)
    held = private / "zetaris" / "sources"
    return [f.name for f in sorted(held.glob("*.csv"))
            if not filecmp.cmp(f, target / "zetaris" / "sources" / f.name, shallow=False)]


def run_checks(target: Path, private: Path) -> bool:
    ok = True
    env = {**os.environ, "DOMINO_PRIVATE_DIR": str(private), "DOMINO_DATA_MODE": "sample"}
    for check in CHECKS:
        out = subprocess.run([sys.executable, "-I", *check], cwd=target, env=env, capture_output=True,
                             text=True, timeout=900)
        last = (out.stdout.strip().splitlines() or [out.stderr.strip()[-300:]])[-1]
        print(f"  {'ok  ' if out.returncode == 0 else 'FAIL'} {check[0]}: {last}")
        ok &= out.returncode == 0
    return ok


def rehearse(p: dict, private: Path) -> int:
    with tempfile.TemporaryDirectory(prefix="domino-rehearsal-") as tmp:
        clone, after = Path(tmp) / "repo", Path(tmp) / "private-after"
        subprocess.run(["git", "clone", "-q", str(ROOT), str(clone)], check=True, timeout=300)
        # The private folder as it would be after a release: labels only, no held-out worlds.
        shutil.copytree(private / "ground_truth", after / "ground_truth")
        print(f"Rehearsal in a clone of HEAD ({clone})")
        changed = release(p, clone, private)
        print("  sources: " + (f"DIFFER from the private set: {', '.join(changed)}" if changed
                               else "identical to the private set Zetaris loads (row IDs unchanged)"))
        ok = run_checks(clone, after) and not changed
    print("Rehearsal passed; the repo and the private folder were not changed." if ok else "Rehearsal FAILED.")
    return 0 if ok else 1


def apply(p: dict, private: Path) -> int:
    dirty = subprocess.run(["git", "status", "--porcelain", "--", "worlds", "zetaris"], cwd=ROOT,
                           capture_output=True, text=True, check=True).stdout.strip()
    if dirty:
        raise SystemExit("Commit or stash changes under worlds/ and zetaris/ first:\n" + dirty)
    changed = release(p, ROOT, private)
    if changed:
        raise SystemExit(f"Stopped: rebuilt sources differ from the private set ({', '.join(changed)}). "
                         "Review with git diff; the private folder was not changed.")
    stash = private / "released" / time.strftime("%Y-%m-%d_%H%M")
    for src, _rel in p["copies"]:
        if src.name != "dq_report.json" and src.exists():
            dest = stash / src.relative_to(private)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), dest)
    print(f"Released. Private copies moved to {stash}. Review `git status`, run the checks, then commit.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--rehearse", action="store_true", help="full release in a throwaway clone, then the checks")
    mode.add_argument("--apply", action="store_true", help="the real release into this checkout")
    args = parser.parse_args()
    private = config.private_dir()
    p = plan(private)
    show(p, ROOT)
    if args.rehearse:
        return rehearse(p, private)
    if args.apply:
        return apply(p, private)
    print("Plan only: nothing was written. --rehearse tries it in a throwaway clone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
