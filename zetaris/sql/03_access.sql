-- Read-only access for the agent's non-admin user. {agent_user} is filled in from .env by setup.py.
-- A rebuilt USL gets a new ID, so setup.py re-runs this file after every rebuild.
--
-- The SQL grant alone is NOT enough. Two one-time UI steps are also needed (confirmed 23 Oct 2026):
--   1. Management -> Permissions -> the agent user -> tick View on "Unified Semantic Layer" (not Execute)
--   2. Data Product -> Unified Semantic Layer -> "domino" namespace -> Namespace actions -> Access Control
--      -> Assign Users -> the agent user
-- Check with: python3 -m data_layer doctor, then a dependency_path call in live mode.

GRANT SELECT ON USL NAMESPACE lightning.metastore.domino TO USER '{agent_user}'
;
