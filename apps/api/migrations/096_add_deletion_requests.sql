CREATE TABLE IF NOT EXISTS merchant_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  requested_by_staff_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  processed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','CANCELLED','COMPLETED')),
  cancellation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_merchant_deletion_requests_merchant_id
  ON merchant_deletion_requests(merchant_id);

CREATE INDEX IF NOT EXISTS idx_merchant_deletion_requests_status_scheduled_for
  ON merchant_deletion_requests(status, scheduled_for);
