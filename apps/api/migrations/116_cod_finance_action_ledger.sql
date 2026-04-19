-- Migration 116: COD finance action ledger
-- Scope:
-- 1) Deterministic audit trail for COD reconciliation and settlement close actions
-- 2) Approval-sensitive metadata persistence for high-variance finance operations

CREATE TABLE IF NOT EXISTS cod_finance_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  action_type VARCHAR(40) NOT NULL
    CHECK (action_type IN ('ORDER_RECONCILE', 'ORDER_DISPUTE', 'STATEMENT_CLOSE')),
  statement_id UUID REFERENCES cod_statement_imports(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  expected_amount NUMERIC(12,2),
  actual_amount NUMERIC(12,2),
  variance_amount NUMERIC(12,2),
  confidence_score INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  approval_granted BOOLEAN NOT NULL DEFAULT false,
  approval_actor VARCHAR(100),
  approval_reason TEXT,
  action_notes TEXT,
  acted_by VARCHAR(100),
  acted_role VARCHAR(30),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_finance_actions_merchant_created
  ON cod_finance_actions (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cod_finance_actions_merchant_type
  ON cod_finance_actions (merchant_id, action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cod_finance_actions_statement
  ON cod_finance_actions (statement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cod_finance_actions_order
  ON cod_finance_actions (order_id, created_at DESC);
