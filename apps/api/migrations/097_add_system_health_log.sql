CREATE TABLE IF NOT EXISTS system_health_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_health_log_event_type_created_at
  ON system_health_log(event_type, created_at DESC);
