-- Rollback: 025_create_carbon_methodologies.sql
DROP INDEX IF EXISTS idx_carbon_methodologies_standard;
DROP INDEX IF EXISTS idx_carbon_methodologies_category;
DROP TABLE IF EXISTS carbon_methodologies;
