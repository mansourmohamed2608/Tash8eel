-- Migration: 076_branch_extensions.sql
-- Description: Add branch-level staff assignments, goals/targets, and WhatsApp number per branch

-- ─────────────────────────────────────────────
-- 1. WhatsApp number on merchant_branches
-- ─────────────────────────────────────────────
ALTER TABLE merchant_branches
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours JSONB DEFAULT '{}';

-- ─────────────────────────────────────────────
-- 2. Branch ↔ Staff assignments
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_staff_assignments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id  VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES merchant_staff(id) ON DELETE CASCADE,
  role         VARCHAR(50) NOT NULL DEFAULT 'AGENT',   -- mirrors staff_role but branch-scoped
  is_primary   BOOLEAN NOT NULL DEFAULT false,         -- primary branch for this staff member
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_bsa_merchant  ON branch_staff_assignments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_bsa_branch    ON branch_staff_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_bsa_staff     ON branch_staff_assignments(staff_id);

-- ─────────────────────────────────────────────
-- 3. Branch goals / targets
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'goal_period_type') THEN
    CREATE TYPE goal_period_type AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS branch_goals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id      VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
  period_type      goal_period_type NOT NULL DEFAULT 'MONTHLY',
  target_revenue   NUMERIC(14,2),
  target_orders    INTEGER,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  notes            TEXT,
  created_by       UUID REFERENCES merchant_staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_bg_merchant   ON branch_goals(merchant_id);
CREATE INDEX IF NOT EXISTS idx_bg_branch     ON branch_goals(branch_id);
CREATE INDEX IF NOT EXISTS idx_bg_dates      ON branch_goals(branch_id, start_date, end_date);
