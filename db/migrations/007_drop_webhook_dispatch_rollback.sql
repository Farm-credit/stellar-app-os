-- Rollback: 007_drop_webhook_dispatch_rollback.sql
--
-- Reverses migration 007 (webhook dispatch). Existing data WILL be lost.

-- Drop in reverse dependency order ───────────────────────────────────────────

DROP TABLE IF EXISTS webhook_deliveries     CASCADE;
DROP TABLE IF EXISTS webhook_subscriptions  CASCADE;

DROP TYPE IF EXISTS webhook_delivery_status CASCADE;
