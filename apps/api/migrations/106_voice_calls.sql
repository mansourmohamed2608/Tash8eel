CREATE TABLE IF NOT EXISTS voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL,
  call_sid VARCHAR(100) NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  handled_by VARCHAR(20) DEFAULT 'ai',
  status VARCHAR(20) DEFAULT 'active',
  transcript JSONB DEFAULT '[]',
  order_id VARCHAR(100),
  recording_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_merchant
ON voice_calls(merchant_id, started_at DESC);
