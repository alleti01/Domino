"""One map of Domino's Zetaris sources and USL tables, shared by the data layer and zetaris/build_sources.py.

Raw source tables (in the Zetaris database `domino_src`) and the system each one stands for, the row-ID
prefix each uses, and the USL tables the agent may query with the raw table each is built from.
"""

from __future__ import annotations

USL = "lightning.metastore.domino.systems"
SYSTEM_COLUMN = "system_id"

# raw source table -> (source system, row-id prefix)
RAW_SOURCES = {
    "change_records": ("change_records", "cr"),
    "change_items": ("change_records", "ci"),
    "access_grants": ("db_catalog", "ag"),
    "table_inventory": ("db_catalog", "ti"),
    "inventory_records": ("inventory_registry", "ir"),
    "job_definitions": ("pipeline_repo", "jd"),
    "interface_contracts": ("service_catalog", "ic"),
    "runtime_config": ("runtime_config", "rc"),
    "query_telemetry": ("telemetry", "qt"),
}
PREFIX_TO_SOURCE = {prefix: system for system, prefix in RAW_SOURCES.values()}

# USL table -> (raw source table it is built from, or None when it joins several, description)
USL_TABLES = {
    "principal": ("access_grants", "identities known to the database catalog"),
    "database_entity": ("table_inventory", "databases known to the catalog"),
    "data_table": ("table_inventory", "tables per database, with column counts"),
    "access_grant": ("access_grants", "current read grants per identity and database"),
    "change_statement": ("change_records", "grant statements in a proposed change"),
    "change_item": ("change_items", "other items in a proposed change: IDs, rules, jobs it runs"),
    "inventory_record": ("inventory_records", "registered records with kind, parent, owner and status"),
    "job": ("job_definitions", "services: identity they run as, query, output file"),
    "interface_contract": ("interface_contracts", "what components call, declare and accept"),
    "runtime_setting": ("runtime_config", "services: input file and settings"),
    "query_observation": ("query_telemetry", "observed query results over recent runs"),
    "dependency_edge": (None, "cross-source links joined inside Zetaris, with status and evidence rows"),
}


def source_for_row_id(row_id: str):
    """'jd-0005' -> 'pipeline_repo'; None when the prefix isn't one of ours."""
    prefix = (row_id or "").split("-", 1)[0]
    return PREFIX_TO_SOURCE.get(prefix)
