-- Migration 037 - Integrations (ERP inbound endpoint + events)

CREATE TYPE integration_status AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE IF NOT EXISTS integration_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'INBOUND_WEBHOOK',
  secret VARCHAR(255) NOT NULL,
  status integration_status NOT NULL DEFAULT 'ACTIVE',
  config JSONB NOT NULL DEFAULT '{}',
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, provider, type)
);

CREATE TABLE IF NOT EXISTS integration_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  endpoint_id UUID NOT NULL REFERENCES integration_endpoints(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
  error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_endpoints_merchant ON integration_endpoints(merchant_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_merchant ON integration_events(merchant_id);
CREATE INDEX IF NOT EXISTS idx_integration_events_endpoint ON integration_events(endpoint_id);
