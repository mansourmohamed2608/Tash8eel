-- Migration 003: Message Delivery Lifecycle + Weekly/Monthly Reports
-- Adds retry tracking and extends message delivery for WhatsApp integration

-- ============================================================================
-- MESSAGE DELIVERY ENHANCEMENT
-- ============================================================================

-- Add retry tracking and outbound provider ID
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS provider_message_id_outbound VARCHAR(255),
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Update delivery status enum to include QUEUED
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'QUEUED' AND enumtypid = 'message_delivery_status'::regtype) THEN
    ALTER TYPE message_delivery_status ADD VALUE 'QUEUED' BEFORE 'PENDING';
  END IF;
END $$;

-- Index for retry worker
CREATE INDEX IF NOT EXISTS idx_messages_retry ON messages(next_retry_at, delivery_status) 
  WHERE delivery_status IN ('QUEUED', 'PENDING') AND next_retry_at IS NOT NULL;

-- Index for failed messages (merchant portal)
CREATE INDEX IF NOT EXISTS idx_messages_failed ON messages(merchant_id, delivery_status, created_at) 
  WHERE delivery_status = 'FAILED';

-- ============================================================================
-- MESSAGE DELIVERY EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS message_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- QUEUED, SENT, DELIVERED, READ, FAILED
  provider VARCHAR(50), -- whatsapp, sms, mock
  provider_message_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_events_message ON message_events(message_id);
CREATE INDEX IF NOT EXISTS idx_message_events_merchant ON message_events(merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_events_type ON message_events(event_type, created_at);

-- ============================================================================
-- EXTENDED REPORTS (WEEKLY/MONTHLY)
-- ============================================================================

-- Add period type to reports
ALTER TABLE merchant_reports
ADD COLUMN IF NOT EXISTS period_type VARCHAR(20) NOT NULL DEFAULT 'daily',
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE;

-- Drop old unique constraint if exists and recreate with period_type
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'merchant_reports_merchant_id_report_date_key'
  ) THEN
    ALTER TABLE merchant_reports DROP CONSTRAINT merchant_reports_merchant_id_report_date_key;
  END IF;
END $$;

-- Create new unique constraint including period_type
ALTER TABLE merchant_reports
ADD CONSTRAINT merchant_reports_merchant_period_unique 
  UNIQUE (merchant_id, report_date, period_type);

-- Index for period type queries
CREATE INDEX IF NOT EXISTS idx_reports_period_type ON merchant_reports(merchant_id, period_type, report_date DESC);

-- ============================================================================
-- AGENT SUBSCRIPTIONS (Phase C)
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_agent_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  agent_name VARCHAR(100) NOT NULL, -- 'operations', 'inventory', 'finance'
  enabled BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}',
  plan_tier VARCHAR(50) NOT NULL DEFAULT 'basic', -- 'basic', 'pro', 'enterprise'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_agent_subs_merchant ON merchant_agent_subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_agent_subs_enabled ON merchant_agent_subscriptions(agent_name, enabled) WHERE enabled = true;

-- ============================================================================
-- NOTIFICATION SETTINGS (Phase D)
-- ============================================================================

-- Add notification settings to merchants
ALTER TABLE merchants
ADD COLUMN IF NOT EXISTS whatsapp_reports_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS report_periods_enabled TEXT[] NOT NULL DEFAULT ARRAY['daily'],
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(50);

-- ============================================================================
-- AGENT TASKS ENHANCEMENTS (Phase E - Inventory ready)
-- Add columns if table already exists from 002_production_features.sql
-- ============================================================================

-- Add columns that might be missing from earlier migration
ALTER TABLE agent_tasks
ADD COLUMN IF NOT EXISTS agent_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS event_type VARCHAR(100),
ADD COLUMN IF NOT EXISTS event_id UUID,
ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS result JSONB,
ADD COLUMN IF NOT EXISTS payload JSONB;

-- Create indexes only if they don't exist
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status_v2 ON agent_tasks(status, next_run_at) WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX IF NOT EXISTS idx_agent_tasks_merchant_v2 ON agent_tasks(merchant_id, agent_name) WHERE agent_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_event_v2 ON agent_tasks(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_correlation_v2 ON agent_tasks(correlation_id) WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- INVENTORY (Phase E - Stock tracking)
-- ============================================================================

ALTER TABLE catalog_items
ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_backorder BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  movement_type VARCHAR(50) NOT NULL, -- SALE, RETURN, ADJUSTMENT, RESTOCK, RESERVATION
  quantity INTEGER NOT NULL, -- negative for sales/reservations
  reference_type VARCHAR(50), -- ORDER, ADJUSTMENT, IMPORT
  reference_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(catalog_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_merchant ON stock_movements(merchant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

-- Low stock alerts
CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL, -- LOW_STOCK, OUT_OF_STOCK, OVERSTOCK
  current_quantity INTEGER NOT NULL,
  threshold INTEGER,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_merchant ON stock_alerts(merchant_id, acknowledged, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_item ON stock_alerts(catalog_item_id);

-- ============================================================================
-- TRIGGERS (skip if already exist from earlier migrations)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_agent_tasks_updated_at') THEN
    CREATE TRIGGER update_agent_tasks_updated_at BEFORE UPDATE ON agent_tasks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_merchant_agent_subscriptions_updated_at') THEN
    CREATE TRIGGER update_merchant_agent_subscriptions_updated_at BEFORE UPDATE ON merchant_agent_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;