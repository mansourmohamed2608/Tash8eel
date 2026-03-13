-- Migration: 078_branch_shifts.sql
-- Description: Branch shift/session tracking (cashier sessions, opening/closing cash)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'shift_status') THEN
    CREATE TYPE shift_status AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS branch_shifts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id      VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  branch_id        UUID NOT NULL REFERENCES merchant_branches(id) ON DELETE CASCADE,
  shift_number     SERIAL,                     -- auto-incrementing shift number per branch
  opened_by        UUID REFERENCES merchant_staff(id) ON DELETE SET NULL,
  closed_by        UUID REFERENCES merchant_staff(id) ON DELETE SET NULL,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  opening_cash     NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash     NUMERIC(12,2),
  expected_cash    NUMERIC(12,2),              -- calculated at close: opening + cash orders
  cash_difference  NUMERIC(12,2)               -- closing_cash - expected_cash
    GENERATED ALWAYS AS (
      CASE WHEN closing_cash IS NOT NULL AND expected_cash IS NOT NULL
           THEN closing_cash - expected_cash
      END
    ) STORED,
  total_orders     INTEGER DEFAULT 0,
  total_revenue    NUMERIC(14,2) DEFAULT 0,
  notes            TEXT,
  closing_notes    TEXT,
  status           shift_status NOT NULL DEFAULT 'OPEN',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_merchant   ON branch_shifts(merchant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_branch     ON branch_shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at  ON branch_shifts(branch_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_status     ON branch_shifts(branch_id, status);

-- Link orders to shifts
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES branch_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_shift ON orders(shift_id) WHERE shift_id IS NOT NULL;
