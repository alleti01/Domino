"""One command to (re)build Domino's Zetaris layer, as the admin login from .env.

    python3 zetaris/setup.py                 files + sources + USL + access
    python3 zetaris/setup.py --rebuild-usl   remove the USL first, then rebuild it and re-grant access
    python3 zetaris/setup.py --dry-run       print the statements without running anything

Steps:
  files   regenerate the source CSVs and copy them into the Zetaris file store (domino/)
  sources sql/01_sources.sql   register the files as tables in domino_src
  usl     sql/02_usl.sql       compile and activate the USL lightning.metastore.domino.systems
  dq      sql/04_dq.sql        register the custom data-quality rules (re-run after every USL rebuild)
  access  sql/03_access.sql    read-only grant for the agent user (re-run after every USL rebuild)

"Already exists" errors are skipped, so it is safe to re-run. Never uses `docker compose down -v`.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from data_layer import config  # noqa: E402
from data_layer.zetaris_client import ZetarisClient, ZetarisError  # noqa: E402

import build_sources  # noqa: E402

DRIVER = "zetaris-driver-1"
STEPS = ("files", "sources", "usl", "dq", "access")
SQL_FILES = {"sources": "01_sources.sql", "usl": "02_usl.sql", "dq": "04_dq.sql", "access": "03_access.sql"}
SQL_TIMEOUT_S = 600


def statements(path: Path, values: dict) -> list:
    """Split on lines holding only ';' (so a multi-table COMPILE USL stays whole); drop comment lines."""
    out, current = [], []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() == ";":
            if current:
                out.append("\n".join(current).strip().format(**values))
            current = []
        elif not line.lstrip().startswith("--"):
            current.append(line)
    if "".join(current).strip():
        out.append("\n".join(current).strip().format(**values))
    return [s for s in out if s]


def _docker(*args: str) -> str:
    return subprocess.run(["docker", *args], check=True, capture_output=True, text=True, timeout=60).stdout.strip()


def copy_files(dry_run: bool) -> None:
    build_sources.main()
    roots = _docker("exec", DRIVER, "sh", "-c", "ls -d /home/zetaris/customer-data/*/file-store").splitlines()
    if len(roots) != 1:
        raise SystemExit(f"Expected one organisation file store, found: {roots}")
    target = roots[0] + "/domino"
    # The private set (public + held-out rows) wins when it exists; it never enters the repo.
    private = build_sources.private_out_dir()
    source_dir = private if any(private.glob("*.csv")) else build_sources.OUT_DIR
    files = sorted(source_dir.glob("*.csv"))
    print(f"copy {len(files)} files from {'private folder' if source_dir == private else 'repo'} -> {DRIVER}:{target}")
    if dry_run:
        return
    _docker("exec", "-u", "0", DRIVER, "mkdir", "-p", target)
    for f in files:
        _docker("cp", str(f), f"{DRIVER}:{target}/{f.name}")
    _docker("exec", "-u", "0", DRIVER, "chown", "-R", "1001:1001", target)


def run_sql(client, name: str, values: dict, dry_run: bool) -> int:
    failures = 0
    for sql in statements(HERE / "sql" / SQL_FILES[name], values):
        first_line = sql.splitlines()[0][:100]
        if dry_run:
            print(f"  [dry-run] {first_line}")
            continue
        try:
            res = client.run(sql, read_only=False, timeout_s=SQL_TIMEOUT_S, purpose=f"setup:{name}")
            print(f"  ok    {first_line}  ({res.duration_ms} ms)")
        except ZetarisError as error:
            if "already exist" in str(error).lower() or "already been granted" in str(error).lower():
                print(f"  skip  {first_line}  (already exists)")
            else:
                failures += 1
                print(f"  FAIL  {first_line}\n        {str(error)[:600]}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Domino's Zetaris sources and USL")
    parser.add_argument("--steps", default=",".join(STEPS), help=f"comma-separated subset of {STEPS}")
    parser.add_argument("--rebuild-usl", action="store_true", help="remove the USL before compiling it again")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    steps = [s.strip() for s in args.steps.split(",") if s.strip()]
    unknown = sorted(set(steps) - set(STEPS))
    if unknown:
        parser.error(f"unknown steps: {unknown}")

    values = {"agent_user": config.get("ZETARIS_AGENT_USERNAME") or ""}
    if "access" in steps and not values["agent_user"]:
        raise SystemExit("Set ZETARIS_AGENT_USERNAME in .env (python3 -m data_layer set-credentials).")
    client = None if args.dry_run else ZetarisClient("admin")

    failures = 0
    for step in steps:
        print(f"== {step}")
        if step == "files":
            copy_files(args.dry_run)
            continue
        if step == "usl" and args.rebuild_usl and not args.dry_run:
            try:
                client.run("REMOVE USL systems NAMESPACE lightning.metastore.domino", read_only=False,
                           timeout_s=SQL_TIMEOUT_S, purpose="setup:usl")
                print("  ok    REMOVE USL systems")
            except ZetarisError as error:
                print(f"  note  REMOVE USL: {str(error)[:200]}")
        failures += run_sql(client, step, values, args.dry_run)
    print(f"\n{'Done' if not failures else f'{failures} statement(s) failed'}.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
