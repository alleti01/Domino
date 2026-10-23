"""Command line for the data layer.

  python3 -m data_layer doctor                 check settings and Zetaris without printing secrets
  python3 -m data_layer lookup "SELECT ..."    agent lookup (read-only user)
  python3 -m data_layer path ENTITY_ID         dependency path from a changed entity
  python3 -m data_layer worlds                 list worlds
  python3 -m data_layer describe WORLD
  python3 -m data_layer run WORLD VARIANT [--params JSON]
  python3 -m data_layer admin-sql "SQL"        setup only: run one statement as the admin login
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys

from . import config
from .experiments import describe_world, list_worlds, run_experiment
from .lookups import dependency_path, lookup
from .zetaris_client import ZetarisClient, ZetarisError


def _print(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


def doctor() -> int:
    config.load_env()
    print(f".env file: {'found' if config.ENV_FILE.is_file() else 'MISSING (copy .env.example to .env)'}")
    print(f"DOMINO_DATA_MODE: {config.mode()}")
    for name in ("ZETARIS_BASE_URL", "ZETARIS_ORG_ID", "ZETARIS_ADMIN_USERNAME", "ZETARIS_ADMIN_PASSWORD",
                 "ZETARIS_AGENT_USERNAME", "ZETARIS_AGENT_PASSWORD"):
        value = config.get(name)
        shown = value if name in ("ZETARIS_BASE_URL", "ZETARIS_ORG_ID") and value else ("set" if value else "missing")
        print(f"  {name}: {shown}")
    overrides = [n for n in config.shell_overrides() if n.startswith(("ZETARIS_", "DOMINO_"))]
    if overrides:
        print(f"WARNING: shell variables override .env for: {', '.join(overrides)}")
    print(f"docker on PATH: {'yes' if shutil.which('docker') else 'no'}")
    print(f"worlds: {list_worlds() or 'none yet'}")
    ok = True
    for identity in ("admin", "agent"):
        try:
            health = ZetarisClient(identity).health()
        except ZetarisError as error:
            health = {"ok": False, "status": "not configured", "error": str(error)}
        ok = ok and health["ok"]
        print(f"zetaris {identity} login + SELECT 1: {'ok' if health['ok'] else 'FAILED'}"
              + ("" if health["ok"] else f" ({health.get('status')}: {health.get('error')})"))
    return 0 if ok else 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python3 -m data_layer", description="Domino data layer")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor")
    p = sub.add_parser("lookup"); p.add_argument("sql"); p.add_argument("--limit", type=int)
    p = sub.add_parser("path"); p.add_argument("entity_id"); p.add_argument("--max-hops", type=int, default=6)
    sub.add_parser("worlds")
    p = sub.add_parser("describe"); p.add_argument("world")
    p = sub.add_parser("run"); p.add_argument("world"); p.add_argument("variant")
    p.add_argument("--params", default="{}"); p.add_argument("--timeout", type=float, default=60)
    p = sub.add_parser("admin-sql"); p.add_argument("sql")
    args = parser.parse_args(argv)

    if args.cmd == "doctor":
        return doctor()
    if args.cmd == "lookup":
        result = lookup(args.sql, limit=args.limit)
    elif args.cmd == "path":
        result = dependency_path(args.entity_id, max_hops=args.max_hops)
    elif args.cmd == "worlds":
        result = {"worlds": list_worlds()}
    elif args.cmd == "describe":
        result = describe_world(args.world)
    elif args.cmd == "run":
        result = run_experiment(args.world, args.variant, json.loads(args.params), timeout_s=args.timeout)
    else:
        try:
            res = ZetarisClient("admin").run(args.sql, read_only=False, purpose="admin-sql")
            result = {"status": "ok", "query_id": res.query_id, "columns": res.columns, "rows": res.rows,
                      "duration_ms": res.duration_ms}
        except ZetarisError as error:
            result = {"status": error.status, "error": str(error)}
    _print(result)
    return 0 if result.get("status", "ok") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
