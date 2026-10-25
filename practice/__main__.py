"""python3 -m practice list | describe ID | path ENTITY_ID | lookup "SQL" | run ID VARIANT | check"""

from __future__ import annotations

import json
import sys

from . import api


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, rest = args[0], args[1:]
    if cmd == "check":
        from .check import main as check
        return check()
    if cmd == "list":
        out = {"worlds": api.list_worlds()}
    elif cmd == "describe" and len(rest) == 1:
        out = api.describe_world(rest[0])
    elif cmd == "path" and len(rest) == 1:
        out = api.dependency_path(rest[0])
    elif cmd == "lookup" and len(rest) == 1:
        out = api.lookup(rest[0])
    elif cmd == "run" and len(rest) == 2:
        out = api.run_experiment(rest[0], rest[1])
    else:
        print(__doc__)
        return 2
    print(json.dumps(out, indent=2))
    return 0 if out.get("status", "ok") == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
