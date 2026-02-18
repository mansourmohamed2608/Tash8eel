-- Structured quote requests + timeline events

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'feature_request_category' AND e.enumlabel = 'QUOTE'
  ) THEN
    -- already exists
  ELSE
    ALTER TYPE feature_request_category ADD VALUE 'QUOTE';
  END IF;
END $$;

ALTER TABLE feature_requests
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quote_request_status') THEN
    CREATE TYPE quote_request_status AS ENUM (
      'NEW',
      'UNDER_REVIEW',
      'QUOTED',
      'ACCEPTED',
      'REJECTED',
      'ACTIVE',
      'DONE'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS quote_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  feature_request_id UUID REFERENCES feature_requests(id) ON DELETE SET NULL,
  requested_agents TEXT[] DEFAULT ARRAY[]::TEXT[],
  requested_features TEXT[] DEFAULT ARRAY[]::TEXT[],
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  quoted_price_cents INTEGER,
  currency VARCHAR(10) DEFAULT 'EGP',
  status quote_request_status NOT NULL DEFAULT 'NEW',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_quote_feature_request UNIQUE (feature_request_id)
);

CREATE TABLE IF NOT EXISTS quote_request_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_request_id UUID NOT NULL REFERENCES quote_requests(id) ON DELETE CASCADE,
  actor_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  actor_id VARCHAR(100),
  action VARCHAR(50) NOT NULL DEFAULT 'NOTE',
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_merchant ON quote_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests(status);
CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_request_events(quote_request_id);

-- Backfill quote requests for existing QUOTE feature requests (best effort)
INSERT INTO quote_requests (merchant_id, feature_request_id)
SELECT fr.merchant_id, fr.id
FROM feature_requests fr
WHERE fr.category = 'QUOTE'
ON CONFLICT (feature_request_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_quote_requests_updated_at BEFORE UPDATE ON quote_requests
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
