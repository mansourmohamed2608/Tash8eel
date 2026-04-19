-- ============================================================
-- Migration 122: Merchant Business Rules
-- ============================================================
-- Rescued from fervent-merkle-62411e.
--
-- Creates:
--   1. merchant_business_rules — queryable per-merchant rule records
--      for AI routing and autonomous action gating.
--
-- Design intent (KB_RAG_SCHEMA §6):
--   Business rules describe WHAT the assistant is allowed to do and under
--   what conditions.  Unlike KB chunks (informational content), rules are
--   policy gates that the AI must check before committing to an action.
--
--   Rules are queryable by rule_type so the routing layer can load only
--   relevant rules (e.g. "delivery" rules for a delivery question) rather
--   than injecting the entire rule set into every prompt.
-- ============================================================

CREATE TABLE IF NOT EXISTS merchant_business_rules (
  id                    UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id           VARCHAR(50)   NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  -- Values: supported, unsupported, quote, pricing, fulfillment, delivery,
  --         payment, escalation, inventory, cancellation, refund, rush_order
  rule_type             VARCHAR(50)   NOT NULL,

  rule_name             VARCHAR(200)  NOT NULL,
  rule_description      TEXT,

  -- Natural-language condition that triggers the rule
  condition             TEXT,

  -- What the assistant should do when the condition is met
  action                TEXT,

  -- What confidence level is required before the AI can act autonomously
  confidence_required   VARCHAR(20)   NOT NULL DEFAULT 'high',

  human_review_required BOOLEAN       NOT NULL DEFAULT false,

  -- active | paused | archived
  status                VARCHAR(20)   NOT NULL DEFAULT 'active',

  -- Controls display order when listing rules for prompt injection
  sort_order            INTEGER       NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Fast rule lookup by merchant + type (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_business_rules_merchant_type
  ON merchant_business_rules (merchant_id, rule_type)
  WHERE status = 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_merchant_business_rules_updated_at'
  ) THEN
    CREATE TRIGGER update_merchant_business_rules_updated_at
      BEFORE UPDATE ON merchant_business_rules
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
