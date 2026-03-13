-- Migration 083: Add columns required by new automation types
-- Adds: quotes.followup_sent_at, loyalty_members.milestone_notified_at,
--        orders.sla_breach_notified_at, conversations.lead_score

-- ─── quotes: track when a follow-up was last sent ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'quotes') THEN
    ALTER TABLE quotes ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── loyalty_members: track when a milestone notification was last sent ────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'loyalty_members') THEN
    ALTER TABLE loyalty_members ADD COLUMN IF NOT EXISTS milestone_notified_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── orders: track when an SLA-breach notification was sent ───────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'orders') THEN
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS sla_breach_notified_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── conversations: deterministic lead score (HOT / WARM / COLD) ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'conversations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'conversations' AND column_name = 'lead_score'
    ) THEN
      ALTER TABLE conversations ADD COLUMN lead_score TEXT
        CHECK (lead_score IN ('HOT', 'WARM', 'COLD'));
    END IF;
  END IF;
END $$;

-- ─── indexes for scheduler queries ────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'quotes') THEN
    CREATE INDEX IF NOT EXISTS idx_quotes_followup_sent_at
      ON quotes (merchant_id, status, followup_sent_at)
      WHERE status = 'SENT';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'loyalty_members') THEN
    CREATE INDEX IF NOT EXISTS idx_loyalty_milestone_notified
      ON loyalty_members (merchant_id, points, milestone_notified_at);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'orders') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_sla_breach_notified
      ON orders (merchant_id, status, sla_breach_notified_at)
      WHERE status IN ('CONFIRMED', 'SHIPPED');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'conversations') THEN
    CREATE INDEX IF NOT EXISTS idx_conversations_lead_score
      ON conversations (merchant_id, lead_score);
  END IF;
END $$;
