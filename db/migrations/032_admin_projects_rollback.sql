-- Rollback: 032_admin_projects_rollback.sql

BEGIN;

DROP INDEX IF EXISTS idx_admin_projects_status;
DROP TABLE IF EXISTS admin_projects;

COMMIT;
