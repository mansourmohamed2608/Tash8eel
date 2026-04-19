-- Product analytics event tracking

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES merchant_staff(id) ON DELETE SET NULL,
  event_name VARCHAR(120) NOT NULL,
  event_properties JSONB NOT NULL DEFAULT '{}',
  session_id VARCHAR(120),
  source VARCHAR(50) DEFAULT 'portal',
  path VARCHAR(255),
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_merchant ON analytics_events(merchant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);
