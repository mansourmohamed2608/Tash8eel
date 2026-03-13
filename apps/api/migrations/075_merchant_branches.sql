-- 075_merchant_branches.sql
-- Description: Add merchant_branches table and branch_id FK on orders/expenses/conversations
--              Enables per-branch analytics, KPIs, and finance reports.

-- ============================================================================
-- 1. MERCHANT BRANCHES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_branches (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id  VARCHAR(50)  NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,           -- e.g. "الفرع الرئيسي"
  name_en      VARCHAR(255),                    -- optional English name
  city         VARCHAR(100),
  address      TEXT,
  phone        VARCHAR(50),
  manager_name VARCHAR(255),
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  is_default   BOOLEAN      NOT NULL DEFAULT FALSE,  -- exactly one default per merchant
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_merchant       ON merchant_branches(merchant_id);
CREATE INDEX IF NOT EXISTS idx_branches_merchant_active ON merchant_branches(merchant_id, is_active);

-- Ensure at most one default branch per merchant
CREATE UNIQUE INDEX IF NOT EXISTS uidx_branches_default
  ON merchant_branches(merchant_id)
  WHERE is_default = TRUE;

-- ============================================================================
-- 2. ADD branch_id FK TO TRANSACTIONAL TABLES
-- ============================================================================

-- orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(merchant_id, branch_id);

-- expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(merchant_id, branch_id);

-- conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_branch ON conversations(merchant_id, branch_id);

-- ============================================================================
-- 3. SEED: auto-create a default "الفرع الرئيسي" branch for every existing merchant
-- ============================================================================

INSERT INTO merchant_branches (merchant_id, name, is_default, sort_order)
SELECT id, 'الفرع الرئيسي', TRUE, 0
FROM merchants
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. FINANCE SNAPSHOTS — add branch dimension (optional, for pre-aggregated reports)
-- ============================================================================

ALTER TABLE finance_snapshots
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES merchant_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_finance_snapshots_branch ON finance_snapshots(merchant_id, branch_id, snapshot_date);
