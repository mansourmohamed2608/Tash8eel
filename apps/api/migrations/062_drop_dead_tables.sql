-- Migration 062: Drop dead/unused tables
-- These 20 tables are confirmed zero-reference in source code —
-- they are legacy leftovers, duplicates of active tables, or
-- superseded by newer implementations.
--
-- Duplicates:
--   staff_members       → use merchant_staff
--   subscription_plans  → use billing_plans
--   customer_loyalty    → use customer_points
--   orchestrator_tasks  → use team_tasks
--
-- Superseded:
--   billing_history         → billing_invoices
--   delivery_reports        → delivery_outcomes
--   notification_logs       → notification_delivery_log
--   notification_queue      → notifications
--   ocr_extracted_products  → product_ocr_confirmations
--   ocr_scans               → product_ocr_confirmations
--   product_ocr_logs        → product_ocr_confirmations
--   loyalty_programs        → loyalty_tiers
--   loyalty_transactions    → points_transactions
--   merchant_entitlements   → entitlement_changes
--
-- Orphaned / unused:
--   billing_history, events, feature_usage, merchant_settings,
--   scheduled_notifications, whatsapp_media, whatsapp_templates

BEGIN;

-- 1. Duplicates
DROP TABLE IF EXISTS staff_members        CASCADE;
DROP TABLE IF EXISTS subscription_plans   CASCADE;
DROP TABLE IF EXISTS customer_loyalty     CASCADE;
DROP TABLE IF EXISTS orchestrator_tasks   CASCADE;

-- 2. Superseded
DROP TABLE IF EXISTS billing_history         CASCADE;
DROP TABLE IF EXISTS delivery_reports        CASCADE;
DROP TABLE IF EXISTS notification_logs       CASCADE;
DROP TABLE IF EXISTS notification_queue      CASCADE;
DROP TABLE IF EXISTS ocr_extracted_products  CASCADE;
DROP TABLE IF EXISTS ocr_scans              CASCADE;
DROP TABLE IF EXISTS product_ocr_logs       CASCADE;
DROP TABLE IF EXISTS loyalty_programs       CASCADE;
DROP TABLE IF EXISTS loyalty_transactions   CASCADE;
DROP TABLE IF EXISTS merchant_entitlements  CASCADE;

-- 3. Orphaned / unused
DROP TABLE IF EXISTS events                 CASCADE;
DROP TABLE IF EXISTS feature_usage          CASCADE;
DROP TABLE IF EXISTS merchant_settings      CASCADE;
DROP TABLE IF EXISTS scheduled_notifications CASCADE;
DROP TABLE IF EXISTS whatsapp_media         CASCADE;
DROP TABLE IF EXISTS whatsapp_templates     CASCADE;

COMMIT;
