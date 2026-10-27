-- Data-quality rules on the USL, on top of the key rules Zetaris generates from PRIMARY / FOREIGN KEYs.
-- Single-table boolean expressions (REGISTER DQ takes no alias and no window functions).
-- A rebuilt USL drops its rules, so setup.py re-runs this file after every rebuild.
-- Run and inspect them with: python3 zetaris/dq_report.py

REGISTER DQ resolved_link TABLE lightning.metastore.domino.systems.dependency_edge AS edge_status <> 'unresolved'
;
REGISTER DQ known_edge_status TABLE lightning.metastore.domino.systems.dependency_edge AS edge_status IN ('observed', 'inferred', 'unresolved')
;
REGISTER DQ no_self_link TABLE lightning.metastore.domino.systems.dependency_edge AS from_id <> to_id
;
REGISTER DQ owner_present TABLE lightning.metastore.domino.systems.inventory_record AS owner IS NOT NULL AND owner <> ''
;
REGISTER DQ positive_column_count TABLE lightning.metastore.domino.systems.data_table AS column_count > 0
;
REGISTER DQ setting_has_value TABLE lightning.metastore.domino.systems.runtime_setting AS setting_value IS NOT NULL AND setting_value <> ''
;
