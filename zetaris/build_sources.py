"""Generates the synthetic Zetaris source files (CSV) from the world case files.

Each world case is one "system". Its facts are split across independent sources so that no single
file holds the whole chain from a change to its downstream effect. Each engine supplies its own facts
through `worlds/engines/<engine>/facts.py` (`facts_for_case(case_id, case) -> {table: [rows]}`), so an
engine kept in the private folder never reveals its domain in the repo.

  change_records.csv       change_records      grant statements in a proposed change
  change_items.csv         change_records      other items in a proposed change (files, IDs, rules, jobs)
  access_grants.csv        db_catalog          current read grants per principal and database
  table_inventory.csv      db_catalog          tables per database with their column counts
  inventory_records.csv    inventory_registry  registered records, their kind, parent, owner and status
  job_definitions.csv      pipeline_repo       services: identity they run as, query, output file
  interface_contracts.csv  service_catalog     what components call, declare and accept
  runtime_config.csv       runtime_config      services: input file and settings
  query_telemetry.csv      telemetry           observed query results over recent runs

Every row carries `source_system` and `source_row_id`. All data is synthetic.

    python3 zetaris/build_sources.py
"""

from __future__ import annotations

import csv
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
CASES_DIR = ROOT / "worlds" / "cases"
LOAD_ORDER = ROOT / "worlds" / "load_order.txt"
LATE_WORLDS = ROOT / "worlds" / "late_worlds.txt"
LATE_FIRST_ROW = 5001  # late worlds' rows are numbered from here in every set, so no existing row ID moves
OUT_DIR = Path(__file__).resolve().parent / "sources"

TABLES = {
    "change_records": ["source_system", "source_row_id", "system_id", "change_id", "file_path", "statement_seq",
                       "action", "privilege", "principal_name", "database_name", "title"],
    "change_items": ["source_system", "source_row_id", "system_id", "change_id", "file_path", "item_kind",
                     "item_ref", "item_detail", "title"],
    "access_grants": ["source_system", "source_row_id", "system_id", "principal_name", "database_name", "privilege"],
    "table_inventory": ["source_system", "source_row_id", "system_id", "database_name", "table_name", "column_count"],
    "inventory_records": ["source_system", "source_row_id", "system_id", "record_id", "record_kind",
                          "parent_record_id", "owner", "status"],
    "job_definitions": ["source_system", "source_row_id", "system_id", "service_name", "runs_as_principal", "query_id",
                        "query_text", "reads_table", "output_artifact", "output_mode"],
    "interface_contracts": ["source_system", "source_row_id", "system_id", "component", "relation", "target",
                            "contract_key", "contract_value"],
    "runtime_config": ["source_system", "source_row_id", "system_id", "service_name", "input_artifact", "setting_key",
                       "setting_value"],
    "query_telemetry": ["source_system", "source_row_id", "system_id", "query_id", "service_name", "principal_name",
                        "window_days", "sampled_runs", "rows_returned_p50", "artifact_entries_p50"],
}
sys.path.insert(0, str(ROOT))
from data_layer.sources import RAW_SOURCES  # noqa: E402  (one map shared with the data layer)

SOURCE_SYSTEM = {table: system for table, (system, _prefix) in RAW_SOURCES.items()}
PREFIX = {table: prefix for table, (_system, prefix) in RAW_SOURCES.items()}


def _facts_module(case_path: Path, engine: str):
    """The engine's facts.py next to the case (private engines), else the repo engine's."""
    for engines in (case_path.parents[1] / "engines", ROOT / "worlds" / "engines"):
        path = engines / engine / "facts.py"
        if path.is_file():
            spec = importlib.util.spec_from_file_location(f"facts_{engine}_{abs(hash(str(path)))}", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise SystemExit(f"No facts.py for engine {engine!r} (case {case_path.name})")


def later_worlds() -> list:
    """Worlds published after the first release (see worlds/publish_world.py), in the order their rows were
    first loaded: after the data-quality demo rows. Loading them last keeps every source_row_id unchanged."""
    lines = LOAD_ORDER.read_text(encoding="utf-8").splitlines() if LOAD_ORDER.is_file() else []
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def late_worlds() -> list:
    """Public worlds added after the held-out worlds were loaded. Their rows go after every other row and are
    numbered from LATE_FIRST_ROW, in the repo set and the private set alike, so adding them renumbers nothing."""
    lines = LATE_WORLDS.read_text(encoding="utf-8").splitlines() if LATE_WORLDS.is_file() else []
    return [line.strip() for line in lines if line.strip() and not line.startswith("#")]


def _collect(cases_dir: Path, only: list = None, skip: list = ()) -> dict:
    tables = {name: [] for name in TABLES}
    paths = sorted(cases_dir.glob("*.json")) if cases_dir.is_dir() else []
    paths = [cases_dir / f"{w}.json" for w in only] if only is not None else [p for p in paths if p.stem not in skip]
    for path in paths:
        case = json.loads(path.read_text(encoding="utf-8"))
        for name, rows in _facts_module(path, case["engine"]).facts_for_case(path.stem, case).items():
            if name not in TABLES:
                raise SystemExit(f"{path.name}: unknown source table {name!r}")
            for row in rows:
                tables[name].append({**row, "system_id": path.stem})
    return tables


def _write(out_dir: Path, tables: dict, late: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, rows in tables.items():
        if len(rows) >= LATE_FIRST_ROW:
            raise SystemExit(f"{name}: {len(rows)} rows would collide with late-world row IDs from {LATE_FIRST_ROW}")
        numbered = list(enumerate(rows, start=1)) + list(enumerate(late[name], start=LATE_FIRST_ROW))
        with (out_dir / f"{name}.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=TABLES[name], lineterminator="\n")
            writer.writeheader()
            for i, row in numbered:
                writer.writerow({"source_system": SOURCE_SYSTEM[name], "source_row_id": f"{PREFIX[name]}-{i:04d}", **row})


def private_out_dir() -> Path:
    sys.path.insert(0, str(ROOT))
    from data_layer import config
    return config.private_dir() / "zetaris" / "sources"


def main() -> int:
    """Repo CSVs hold public worlds only. When held-out worlds exist in the private folder, the full set
    (public rows first, so their row IDs never change) is written there, and that is what Zetaris loads."""
    later, late = later_worlds(), late_worlds()
    public = _collect(CASES_DIR, skip=later + late)
    # The data-quality demo system (a planted broken link) is public and goes after the worlds' rows.
    import dq_demo
    for name, rows in dq_demo.facts().items():
        public[name] += [{**row, "system_id": dq_demo.SYSTEM_ID} for row in rows]
    for name, rows in _collect(CASES_DIR, only=later).items():
        public[name] += rows
    late_rows = _collect(CASES_DIR, only=late)
    _write(OUT_DIR, public, late_rows)
    sys.path.insert(0, str(ROOT))
    from data_layer import config
    held_out = _collect(config.private_dir() / "worlds" / "cases")
    if any(held_out.values()):
        _write(private_out_dir(), {name: public[name] + held_out[name] for name in TABLES}, late_rows)
    for name in TABLES:
        print(f"{name}.csv: {len(public[name]) + len(late_rows[name])} public rows"
              + (f" + {len(held_out[name])} private" if held_out[name] else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
