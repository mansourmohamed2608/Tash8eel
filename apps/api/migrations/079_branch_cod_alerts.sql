-- Migration 079: Branch-level COD tracking + proactive alert configs restructure
-- Adds branch_id to cod_collections
-- Restructures proactive_alert_configs to allow per-branch configs

-- ============================================================
-- 1. Add branch_id to cod_collections
-- ============================================================
ALTER TABLE cod_collections
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cod_collections_branch
  ON cod_collections(branch_id) WHERE branch_id IS NOT NULL;

-- ============================================================
-- 2. Restructure proactive_alert_configs for per-branch support
-- ============================================================
-- Drop the UNIQUE constraint on merchant_id alone so branch-level rows can co-exist
ALTER TABLE proactive_alert_configs
  DROP CONSTRAINT IF EXISTS proactive_alert_configs_merchant_id_key;

-- Add branch_id (nullable = merchant-level config when NULL)
ALTER TABLE proactive_alert_configs
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE CASCADE;

-- Additional threshold columns for new alert types
ALTER TABLE proactive_alert_configs
  ADD COLUMN IF NOT EXISTS no_orders_threshold_minutes INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS low_cash_threshold NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS alert_email TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS alert_whatsapp TEXT DEFAULT NULL;

-- Unique index: one config per (merchant, branch) — NULL branch_id = merchant-level default
CREATE UNIQUE INDEX IF NOT EXISTS idx_pac_merchant_branch
  ON proactive_alert_configs(merchant_id, COALESCE(branch_id::text, '00000000-0000-0000-0000-000000000000'));

-- ============================================================
-- 3. Ensure finance_snapshots has branch_id (was added in 075, guard idempotent)
-- ============================================================
ALTER TABLE finance_snapshots
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_finance_snapshots_branch
  ON finance_snapshots(branch_id, snapshot_date) WHERE branch_id IS NOT NULL;

-- ============================================================
-- 4. Back-fill: auto-assign branch_id on cod_collections from orders
--    (orders already link via shift → branch, or directly if branch_id column exists on orders)
-- ============================================================
UPDATE cod_collections cc
SET branch_id = o.branch_id
FROM orders o
WHERE cc.order_id = o.id
  AND cc.branch_id IS NULL
  AND o.branch_id IS NOT NULL;
