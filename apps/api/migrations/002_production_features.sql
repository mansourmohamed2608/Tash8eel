-- Migration V2 - Additional tables for production features
-- Add to the init.sql or run as a separate migration

-- Add new columns to merchants table
ALTER TABLE merchants 
  ADD COLUMN IF NOT EXISTS api_key VARCHAR(64) UNIQUE,
  ADD COLUMN IF NOT EXISTS trade_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT 'cairo',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'ar-EG',
  ADD COLUMN IF NOT EXISTS default_delivery_fee DECIMAL(10,2) DEFAULT 30,
  ADD COLUMN IF NOT EXISTS auto_book_delivery BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_followups BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS greeting_template TEXT,
  ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Africa/Cairo',
  ADD COLUMN IF NOT EXISTS auto_response_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_delay_minutes INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS payment_reminders_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS low_stock_alerts_enabled BOOLEAN DEFAULT true;

-- Add message delivery status columns
CREATE TYPE message_status AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ');

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS status message_status DEFAULT 'QUEUED',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error TEXT;

-- Add conversation takeover columns
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_human_takeover BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS taken_over_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS taken_over_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversation_summary TEXT,
  ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

-- Add structured address column
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS structured_address JSONB DEFAULT '{}';

-- Merchant notifications table
CREATE TABLE IF NOT EXISTS merchant_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_merchant ON merchant_notifications(merchant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON merchant_notifications(merchant_id, is_read) WHERE is_read = false;

-- Followups table (standalone, not just on conversation)
CREATE TYPE followup_status AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'FAILED');
CREATE TYPE followup_type AS ENUM (
  'order_confirmation',
  'delivery_reminder', 
  'feedback_request',
  'abandoned_cart',
  'reorder_suggestion',
  'custom'
);

CREATE TABLE IF NOT EXISTS followups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  type followup_type NOT NULL,
  status followup_status NOT NULL DEFAULT 'PENDING',
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  message_template TEXT,
  custom_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_followups_merchant ON followups(merchant_id);
CREATE INDEX IF NOT EXISTS idx_followups_scheduled ON followups(scheduled_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_followups_conversation ON followups(conversation_id);

-- Agent tasks table (for orchestrator)
CREATE TYPE agent_type AS ENUM ('ops', 'inventory', 'finance', 'marketing', 'content', 'support');
CREATE TYPE task_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_type agent_type NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE SET NULL,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  input JSONB NOT NULL,
  status task_status NOT NULL DEFAULT 'PENDING',
  priority INTEGER DEFAULT 5,
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  correlation_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status) WHERE status IN ('PENDING', 'PROCESSING');
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent ON agent_tasks(agent_type, status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_scheduled ON agent_tasks(scheduled_at) WHERE status = 'PENDING';

-- Agent results table
CREATE TABLE IF NOT EXISTS agent_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  agent_type agent_type NOT NULL,
  success BOOLEAN NOT NULL,
  output JSONB,
  error TEXT,
  execution_time_ms INTEGER,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_results_task ON agent_results(task_id);

-- Voice transcriptions table
CREATE TABLE IF NOT EXISTS voice_transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  audio_url TEXT NOT NULL,
  transcription TEXT,
  language VARCHAR(10) DEFAULT 'ar-EG',
  confidence DECIMAL(5,4),
  provider VARCHAR(50) DEFAULT 'mock',
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcriptions_message ON voice_transcriptions(message_id);

-- Address parsing cache
CREATE TABLE IF NOT EXISTS address_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_text TEXT NOT NULL,
  city VARCHAR(100),
  area VARCHAR(255),
  street VARCHAR(255),
  building VARCHAR(100),
  floor VARCHAR(50),
  apartment VARCHAR(50),
  landmark TEXT,
  google_maps_url TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  confidence DECIMAL(5,4),
  missing_fields TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(raw_text)
);

CREATE INDEX IF NOT EXISTS idx_address_cache_raw ON address_cache USING hash(raw_text);

-- Conversation locks table (for distributed locking fallback)
CREATE TABLE IF NOT EXISTS conversation_locks (
  conversation_id VARCHAR(100) PRIMARY KEY,
  locked_by VARCHAR(100) NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_locks_expires ON conversation_locks(expires_at);

-- Apply triggers
CREATE TRIGGER update_followups_updated_at BEFORE UPDATE ON followups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_agent_tasks_updated_at BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add API key generation function
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS VARCHAR(64) AS $$
DECLARE
  key VARCHAR(64);
BEGIN
  key := encode(gen_random_bytes(32), 'hex');
  RETURN 'mapi_' || key;
END;
$$ LANGUAGE plpgsql;

-- Update existing merchants without API keys
UPDATE merchants SET api_key = generate_api_key() WHERE api_key IS NULL;
