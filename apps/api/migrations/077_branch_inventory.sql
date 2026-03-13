-- Migration: 077_branch_inventory.sql
-- Description: Link warehouse_locations to merchant_branches for branch-scoped inventory

ALTER TABLE warehouse_locations
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_branch ON warehouse_locations(branch_id) WHERE branch_id IS NOT NULL;

-- Soft-link default warehouse to default branch per merchant
UPDATE warehouse_locations wl
SET branch_id = mb.id
FROM merchant_branches mb
WHERE mb.merchant_id = wl.merchant_id
  AND mb.is_default = TRUE
  AND wl.is_default = TRUE
  AND wl.branch_id IS NULL;
