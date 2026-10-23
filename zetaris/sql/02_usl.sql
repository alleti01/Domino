-- Unified Semantic Layer over the domino_src sources.
-- Canonical IDs are "<system>/<kind>/<name>". Foreign keys make Zetaris generate DQ rules.
-- dependency_edge is the cross-source join: every edge is built by joining two sources in Zetaris and
-- labelled observed (two sources agree), inferred (one source, or a name-only match) or unresolved
-- (it points at something no source has).

CREATE NAMESPACE IF NOT EXISTS lightning.metastore
;
CREATE NAMESPACE IF NOT EXISTS lightning.metastore.domino
;
COMPILE USL systems DEPLOY NAMESPACE lightning.metastore.domino DDL
CREATE TABLE principal (
    principal_id varchar(200) NOT NULL PRIMARY KEY,
    system_id varchar(40) NOT NULL,
    principal_name varchar(100) NOT NULL,
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE database_entity (
    database_id varchar(200) NOT NULL PRIMARY KEY,
    system_id varchar(40) NOT NULL,
    database_name varchar(100) NOT NULL,
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE data_table (
    table_id varchar(250) NOT NULL PRIMARY KEY,
    database_id varchar(200) NOT NULL FOREIGN KEY REFERENCES database_entity(database_id),
    system_id varchar(40) NOT NULL,
    table_name varchar(100) NOT NULL,
    column_count int,
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE access_grant (
    grant_id varchar(200) NOT NULL PRIMARY KEY,
    principal_id varchar(200) NOT NULL FOREIGN KEY REFERENCES principal(principal_id),
    database_id varchar(200) NOT NULL FOREIGN KEY REFERENCES database_entity(database_id),
    system_id varchar(40) NOT NULL,
    privilege varchar(20),
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE change_statement (
    stmt_id varchar(200) NOT NULL PRIMARY KEY,
    change_id varchar(200) NOT NULL,
    system_id varchar(40) NOT NULL,
    action varchar(20),
    privilege varchar(20),
    principal_id varchar(200) NOT NULL FOREIGN KEY REFERENCES principal(principal_id),
    database_id varchar(200) NOT NULL FOREIGN KEY REFERENCES database_entity(database_id),
    file_path varchar(300),
    title varchar(300),
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE job (
    job_id varchar(200) NOT NULL PRIMARY KEY,
    system_id varchar(40) NOT NULL,
    service_name varchar(100) NOT NULL,
    principal_id varchar(200) NOT NULL FOREIGN KEY REFERENCES principal(principal_id),
    query_id varchar(200),
    query_text varchar(1000),
    reads_table varchar(100),
    output_artifact_id varchar(200),
    output_mode varchar(40),
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE runtime_setting (
    setting_id varchar(250) NOT NULL PRIMARY KEY,
    system_id varchar(40) NOT NULL,
    service_id varchar(200) NOT NULL,
    input_artifact_id varchar(200),
    setting_key varchar(100),
    setting_value varchar(100),
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE query_observation (
    obs_id varchar(200) NOT NULL PRIMARY KEY,
    system_id varchar(40) NOT NULL,
    query_id varchar(200) NOT NULL,
    job_id varchar(200) NOT NULL FOREIGN KEY REFERENCES job(job_id),
    window_days int,
    sampled_runs int,
    rows_returned_p50 int,
    artifact_entries_p50 int,
    source_system varchar(40),
    source_row_id varchar(40)
);
CREATE TABLE dependency_edge (
    edge_id varchar(300) NOT NULL PRIMARY KEY,
    system_id varchar(40) NOT NULL,
    from_id varchar(300) NOT NULL,
    from_type varchar(20),
    to_id varchar(300) NOT NULL,
    to_type varchar(20),
    relation varchar(40),
    edge_status varchar(20),
    evidence varchar(500),
    detail varchar(1000)
)
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.principal AS
SELECT COALESCE(principal_id, '') AS principal_id,
       COALESCE(system_id, '') AS system_id,
       COALESCE(principal_name, '') AS principal_name,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/principal/', principal_name) AS principal_id, system_id, principal_name,
         'db_catalog' AS source_system, MIN(source_row_id) AS source_row_id
  FROM domino_src.access_grants GROUP BY system_id, principal_name
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.database_entity AS
SELECT COALESCE(database_id, '') AS database_id,
       COALESCE(system_id, '') AS system_id,
       COALESCE(database_name, '') AS database_name,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/database/', database_name) AS database_id, system_id, database_name,
         'db_catalog' AS source_system, MIN(source_row_id) AS source_row_id
  FROM domino_src.table_inventory GROUP BY system_id, database_name
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.data_table AS
SELECT COALESCE(table_id, '') AS table_id,
       COALESCE(database_id, '') AS database_id,
       COALESCE(system_id, '') AS system_id,
       COALESCE(table_name, '') AS table_name,
       column_count,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/table/', database_name, '.', table_name) AS table_id,
         concat(system_id, '/database/', database_name) AS database_id, system_id, table_name,
         CAST(column_count AS INT) AS column_count, source_system, source_row_id
  FROM domino_src.table_inventory
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.access_grant AS
SELECT COALESCE(grant_id, '') AS grant_id,
       COALESCE(principal_id, '') AS principal_id,
       COALESCE(database_id, '') AS database_id,
       COALESCE(system_id, '') AS system_id,
       privilege,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/grant/', source_row_id) AS grant_id,
         concat(system_id, '/principal/', principal_name) AS principal_id,
         concat(system_id, '/database/', database_name) AS database_id, system_id, privilege, source_system, source_row_id
  FROM domino_src.access_grants
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.change_statement AS
SELECT COALESCE(stmt_id, '') AS stmt_id,
       COALESCE(change_id, '') AS change_id,
       COALESCE(system_id, '') AS system_id,
       action,
       privilege,
       COALESCE(principal_id, '') AS principal_id,
       COALESCE(database_id, '') AS database_id,
       file_path,
       title,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/change/', change_id, '#', statement_seq) AS stmt_id,
         concat(system_id, '/change/', change_id) AS change_id, system_id, action, privilege,
         concat(system_id, '/principal/', principal_name) AS principal_id,
         concat(system_id, '/database/', database_name) AS database_id, file_path, title, source_system, source_row_id
  FROM domino_src.change_records
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.job AS
SELECT COALESCE(job_id, '') AS job_id,
       COALESCE(system_id, '') AS system_id,
       COALESCE(service_name, '') AS service_name,
       COALESCE(principal_id, '') AS principal_id,
       query_id,
       query_text,
       reads_table,
       output_artifact_id,
       output_mode,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/service/', service_name) AS job_id, system_id, service_name,
         concat(system_id, '/principal/', runs_as_principal) AS principal_id,
         concat(system_id, '/query/', query_id) AS query_id, query_text, reads_table,
         concat(system_id, '/artifact/', output_artifact) AS output_artifact_id, output_mode, source_system, source_row_id
  FROM domino_src.job_definitions
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.runtime_setting AS
SELECT COALESCE(setting_id, '') AS setting_id,
       COALESCE(system_id, '') AS system_id,
       COALESCE(service_id, '') AS service_id,
       input_artifact_id,
       setting_key,
       setting_value,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/setting/', service_name, '.', setting_key) AS setting_id, system_id,
         concat(system_id, '/service/', service_name) AS service_id,
         concat(system_id, '/artifact/', input_artifact) AS input_artifact_id, setting_key, setting_value,
         source_system, source_row_id
  FROM domino_src.runtime_config
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.query_observation AS
SELECT COALESCE(obs_id, '') AS obs_id,
       COALESCE(system_id, '') AS system_id,
       COALESCE(query_id, '') AS query_id,
       COALESCE(job_id, '') AS job_id,
       window_days,
       sampled_runs,
       rows_returned_p50,
       artifact_entries_p50,
       source_system,
       source_row_id
FROM (
  SELECT concat(system_id, '/observation/', source_row_id) AS obs_id, system_id,
         concat(system_id, '/query/', query_id) AS query_id,
         concat(system_id, '/service/', service_name) AS job_id,
         CAST(window_days AS INT) AS window_days, CAST(sampled_runs AS INT) AS sampled_runs,
         CAST(rows_returned_p50 AS INT) AS rows_returned_p50, CAST(artifact_entries_p50 AS INT) AS artifact_entries_p50,
         source_system, source_row_id
  FROM domino_src.query_telemetry
) src
;
ACTIVATE USL TABLE lightning.metastore.domino.systems.dependency_edge AS
SELECT COALESCE(edge_id, '') AS edge_id,
       COALESCE(system_id, '') AS system_id,
       COALESCE(from_id, '') AS from_id,
       from_type,
       COALESCE(to_id, '') AS to_id,
       to_type,
       relation,
       edge_status,
       evidence,
       detail
FROM (
  SELECT concat(c.system_id, '/edge/', c.source_row_id, '/principal') AS edge_id, c.system_id,
           concat(c.system_id, '/change/', c.change_id) AS from_id, 'change' AS from_type,
           concat(c.system_id, '/principal/', c.principal_name) AS to_id, 'principal' AS to_type, 'grants_to' AS relation,
           CASE WHEN p.src IS NULL THEN 'unresolved' ELSE 'observed' END AS edge_status,
           concat('change_records:', c.source_row_id, CASE WHEN p.src IS NULL THEN '' ELSE concat(';db_catalog:', p.src) END) AS evidence,
           concat(c.action, ' ', c.privilege, ' ON ', c.database_name, '.*') AS detail
    FROM domino_src.change_records c
    LEFT JOIN (SELECT system_id, principal_name, MIN(source_row_id) AS src FROM domino_src.access_grants
               GROUP BY system_id, principal_name) p
      ON p.system_id = c.system_id AND p.principal_name = c.principal_name
    UNION ALL
    SELECT concat(c.system_id, '/edge/', c.source_row_id, '/database'), c.system_id,
           concat(c.system_id, '/change/', c.change_id), 'change',
           concat(c.system_id, '/database/', c.database_name), 'database', 'grants_on',
           CASE WHEN d.src IS NULL THEN 'unresolved' ELSE 'observed' END,
           concat('change_records:', c.source_row_id, CASE WHEN d.src IS NULL THEN '' ELSE concat(';db_catalog:', d.src) END),
           concat(c.action, ' ', c.privilege, ' TO ', c.principal_name)
    FROM domino_src.change_records c
    LEFT JOIN (SELECT system_id, database_name, MIN(source_row_id) AS src FROM domino_src.table_inventory
               GROUP BY system_id, database_name) d
      ON d.system_id = c.system_id AND d.database_name = c.database_name
    UNION ALL
    SELECT concat(j.system_id, '/edge/', j.source_row_id, '/identity'), j.system_id,
           concat(j.system_id, '/principal/', j.runs_as_principal), 'principal',
           concat(j.system_id, '/service/', j.service_name), 'service', 'identity_of',
           CASE WHEN p.src IS NULL THEN 'unresolved' ELSE 'observed' END,
           concat('pipeline_repo:', j.source_row_id, CASE WHEN p.src IS NULL THEN '' ELSE concat(';db_catalog:', p.src) END),
           concat('service runs as ', j.runs_as_principal)
    FROM domino_src.job_definitions j
    LEFT JOIN (SELECT system_id, principal_name, MIN(source_row_id) AS src FROM domino_src.access_grants
               GROUP BY system_id, principal_name) p
      ON p.system_id = j.system_id AND p.principal_name = j.runs_as_principal
    UNION ALL
    SELECT concat(t.system_id, '/edge/', t.source_row_id, '/contains'), t.system_id,
           concat(t.system_id, '/database/', t.database_name), 'database',
           concat(t.system_id, '/table/', t.database_name, '.', t.table_name), 'table', 'contains', 'inferred',
           concat('db_catalog:', t.source_row_id), concat('column_count=', t.column_count)
    FROM domino_src.table_inventory t
    UNION ALL
    SELECT concat(j.system_id, '/edge/', j.source_row_id, '/reads/', COALESCE(t.source_row_id, 'none')), j.system_id,
           concat(j.system_id, '/service/', j.service_name), 'service',
           CASE WHEN t.source_row_id IS NULL THEN concat(j.system_id, '/table/?.', j.reads_table)
                ELSE concat(j.system_id, '/table/', t.database_name, '.', t.table_name) END, 'table', 'reads',
           CASE WHEN t.source_row_id IS NULL THEN 'unresolved' ELSE 'inferred' END,
           concat('pipeline_repo:', j.source_row_id, CASE WHEN t.source_row_id IS NULL THEN '' ELSE concat(';db_catalog:', t.source_row_id) END),
           concat('matched on table name ', j.reads_table)
    FROM domino_src.job_definitions j
    LEFT JOIN domino_src.table_inventory t ON t.system_id = j.system_id AND t.table_name = j.reads_table
    UNION ALL
    SELECT concat(j.system_id, '/edge/', j.source_row_id, '/executes'), j.system_id,
           concat(j.system_id, '/service/', j.service_name), 'service',
           concat(j.system_id, '/query/', j.query_id), 'query', 'executes',
           CASE WHEN q.source_row_id IS NULL THEN 'inferred' ELSE 'observed' END,
           concat('pipeline_repo:', j.source_row_id, CASE WHEN q.source_row_id IS NULL THEN '' ELSE concat(';telemetry:', q.source_row_id) END),
           CASE WHEN q.source_row_id IS NULL THEN j.query_text
                ELSE concat(j.query_text, ' | rows_returned_p50=', q.rows_returned_p50, ' over ', q.sampled_runs, ' runs in ', q.window_days, ' days') END
    FROM domino_src.job_definitions j
    LEFT JOIN domino_src.query_telemetry q ON q.system_id = j.system_id AND q.query_id = j.query_id
    UNION ALL
    SELECT concat(j.system_id, '/edge/', j.source_row_id, '/writes'), j.system_id,
           concat(j.system_id, '/service/', j.service_name), 'service',
           concat(j.system_id, '/artifact/', j.output_artifact), 'artifact', 'writes',
           CASE WHEN r.src IS NULL THEN 'inferred' ELSE 'observed' END,
           concat('pipeline_repo:', j.source_row_id, CASE WHEN r.src IS NULL THEN '' ELSE concat(';runtime_config:', r.src) END),
           concat('output_mode=', j.output_mode)
    FROM domino_src.job_definitions j
    LEFT JOIN (SELECT system_id, input_artifact, MIN(source_row_id) AS src FROM domino_src.runtime_config
               GROUP BY system_id, input_artifact) r
      ON r.system_id = j.system_id AND r.input_artifact = j.output_artifact
    UNION ALL
    SELECT concat(r.system_id, '/edge/', r.src, '/loaded_by'), r.system_id,
           concat(r.system_id, '/artifact/', r.input_artifact), 'artifact',
           concat(r.system_id, '/service/', r.service_name), 'service', 'loaded_by',
           CASE WHEN j.source_row_id IS NULL THEN 'unresolved' ELSE 'observed' END,
           concat('runtime_config:', r.src, CASE WHEN j.source_row_id IS NULL THEN '' ELSE concat(';pipeline_repo:', j.source_row_id) END),
           'read at startup'
    FROM (SELECT system_id, service_name, input_artifact, MIN(source_row_id) AS src FROM domino_src.runtime_config
          GROUP BY system_id, service_name, input_artifact) r
    LEFT JOIN domino_src.job_definitions j ON j.system_id = r.system_id AND j.output_artifact = r.input_artifact
    UNION ALL
    SELECT concat(r.system_id, '/edge/', r.source_row_id, '/setting'), r.system_id,
           concat(r.system_id, '/service/', r.service_name), 'service',
           concat(r.system_id, '/setting/', r.service_name, '.', r.setting_key), 'setting', 'configured_with', 'inferred',
           concat('runtime_config:', r.source_row_id), concat(r.setting_key, '=', r.setting_value)
    FROM domino_src.runtime_config r
) src
;
