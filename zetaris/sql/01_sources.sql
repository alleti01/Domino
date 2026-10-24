-- Register the synthetic source files as Zetaris file-store tables.
-- Statements are separated by a line holding only ";" (run with zetaris/setup.py).
-- Files must already be in the organisation file store under domino/ (setup.py copies them).

CREATE LIGHTNING DATABASE domino_src DESCRIBE BY "Domino synthetic sources - change records, catalog, pipeline, runtime, telemetry"
;
CREATE LIGHTNING FILESTORE TABLE change_records FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/change_records.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE access_grants FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/access_grants.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE table_inventory FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/table_inventory.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE job_definitions FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/job_definitions.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE runtime_config FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/runtime_config.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE query_telemetry FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/query_telemetry.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE change_items FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/change_items.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE inventory_records FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/inventory_records.csv", header "true", inferSchema "false")
;
CREATE LIGHTNING FILESTORE TABLE interface_contracts FROM domino_src FORMAT CSV OPTIONS (PATH "dffs://domino/interface_contracts.csv", header "true", inferSchema "false")
;
-- The database catalog lives in a real PostgreSQL database (started by setup.py), read over JDBC.
-- {catalog_password} is filled in from .env by setup.py and masked in every log.
CREATE DATASOURCE catalog_db DESCRIBE BY "Database catalog - PostgreSQL"
OPTIONS (jdbcdriver "org.postgresql.Driver", jdbcurl "jdbc:postgresql://domino-catalog-db:5432/catalog",
username "domino_catalog", password "{catalog_password}")
;
REGISTER DATASOURCE TABLES ("access_grants", "table_inventory", "principal_refs", "database_refs") FROM catalog_db
;
