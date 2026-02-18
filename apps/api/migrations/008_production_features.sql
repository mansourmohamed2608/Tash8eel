-- Production Features Migration
-- Audit Logging, Webhooks, Staff Management, Rate Limiting

-- ============================================================================
-- AUDIT LOGGING
-- ============================================================================

CREATE TYPE audit_action AS ENUM (
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'VIEW', 
  'EXPORT', 'IMPORT', 'API_CALL', 'SETTINGS_CHANGE', 'TAKEOVER'
);

CREATE TYPE audit_resource AS ENUM (
  'ORDER', 'CONVERSATION', 'CUSTOMER', 'PRODUCT', 'VARIANT',
  'MERCHANT', 'STAFF', 'WEBHOOK', 'SETTINGS', 'REPORT', 'API_KEY'
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  staff_id UUID, -- NULL for API key actions
  action audit_action NOT NULL,
  resource audit_resource NOT NULL,
  resource_id VARCHAR(255),
  old_values JSONB,
  new_values JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  correlation_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_merchant ON audit_logs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_audit_staff ON audit_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_merchant_created ON audit_logs(merchant_id, created_at DESC);

-- Partition audit logs by month (optional but recommended for large scale)
-- Can be implemented later with pg_partman

-- ============================================================================
-- STAFF & TEAM MANAGEMENT
-- ============================================================================

CREATE TYPE staff_role AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER');
CREATE TYPE staff_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITE');

CREATE TABLE merchant_staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255), -- NULL for pending invites
  role staff_role NOT NULL DEFAULT 'AGENT',
  status staff_status NOT NULL DEFAULT 'PENDING_INVITE',
  permissions JSONB NOT NULL DEFAULT '{}',
  invite_token VARCHAR(255) UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  mfa_secret VARCHAR(255),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_staff_merchant ON merchant_staff(merchant_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON merchant_staff(email);
CREATE INDEX IF NOT EXISTS idx_staff_status ON merchant_staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_invite_token ON merchant_staff(invite_token) WHERE invite_token IS NOT NULL;

-- Staff sessions for JWT refresh token tracking
CREATE TABLE staff_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id UUID NOT NULL REFERENCES merchant_staff(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,
  device_info JSONB NOT NULL DEFAULT '{}',
  ip_address VARCHAR(45),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_staff ON staff_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_sessions_refresh ON staff_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON staff_sessions(expires_at);

-- Permission templates for quick role assignment
CREATE TABLE permission_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE CASCADE, -- NULL for system templates
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default permission templates
INSERT INTO permission_templates (name, description, permissions, is_system) VALUES
('owner_full_access', 'Full access for owner', '{
  "orders": {"create": true, "read": true, "update": true, "delete": true, "export": true},
  "conversations": {"read": true, "respond": true, "takeover": true, "close": true},
  "customers": {"read": true, "update": true, "delete": true, "export": true},
  "products": {"create": true, "read": true, "update": true, "delete": true, "import": true, "export": true},
  "inventory": {"read": true, "update": true},
  "staff": {"invite": true, "read": true, "update": true, "remove": true},
  "settings": {"read": true, "update": true},
  "webhooks": {"create": true, "read": true, "update": true, "delete": true, "test": true},
  "reports": {"read": true, "export": true},
  "audit": {"read": true}
}'::jsonb, true),
('admin_access', 'Admin access without staff management', '{
  "orders": {"create": true, "read": true, "update": true, "delete": false, "export": true},
  "conversations": {"read": true, "respond": true, "takeover": true, "close": true},
  "customers": {"read": true, "update": true, "delete": false, "export": true},
  "products": {"create": true, "read": true, "update": true, "delete": false, "import": true, "export": true},
  "inventory": {"read": true, "update": true},
  "staff": {"invite": false, "read": true, "update": false, "remove": false},
  "settings": {"read": true, "update": false},
  "webhooks": {"create": true, "read": true, "update": true, "delete": false, "test": true},
  "reports": {"read": true, "export": true},
  "audit": {"read": true}
}'::jsonb, true),
('agent_access', 'Customer service agent access', '{
  "orders": {"create": true, "read": true, "update": true, "delete": false, "export": false},
  "conversations": {"read": true, "respond": true, "takeover": true, "close": true},
  "customers": {"read": true, "update": true, "delete": false, "export": false},
  "products": {"create": false, "read": true, "update": false, "delete": false, "import": false, "export": false},
  "inventory": {"read": true, "update": false},
  "staff": {"invite": false, "read": false, "update": false, "remove": false},
  "settings": {"read": false, "update": false},
  "webhooks": {"create": false, "read": false, "update": false, "delete": false, "test": false},
  "reports": {"read": true, "export": false},
  "audit": {"read": false}
}'::jsonb, true),
('viewer_access', 'Read-only access', '{
  "orders": {"create": false, "read": true, "update": false, "delete": false, "export": false},
  "conversations": {"read": true, "respond": false, "takeover": false, "close": false},
  "customers": {"read": true, "update": false, "delete": false, "export": false},
  "products": {"create": false, "read": true, "update": false, "delete": false, "import": false, "export": false},
  "inventory": {"read": true, "update": false},
  "staff": {"invite": false, "read": false, "update": false, "remove": false},
  "settings": {"read": false, "update": false},
  "webhooks": {"create": false, "read": false, "update": false, "delete": false, "test": false},
  "reports": {"read": true, "export": false},
  "audit": {"read": false}
}'::jsonb, true);

-- ============================================================================
-- WEBHOOKS
-- ============================================================================

CREATE TYPE webhook_status AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED', 'FAILING');

CREATE TABLE webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  url VARCHAR(2048) NOT NULL,
  secret VARCHAR(255) NOT NULL, -- For HMAC signature verification
  events TEXT[] NOT NULL DEFAULT '{}', -- e.g., ['order.created', 'order.delivered']
  headers JSONB NOT NULL DEFAULT '{}', -- Custom headers to include
  status webhook_status NOT NULL DEFAULT 'ACTIVE',
  retry_count INTEGER NOT NULL DEFAULT 3,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  created_by UUID REFERENCES merchant_staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_merchant ON webhooks(merchant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING gin(events);

-- Webhook delivery log
CREATE TYPE webhook_delivery_status AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status webhook_delivery_status NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  error TEXT,
  next_retry_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'RETRYING';
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_merchant ON webhook_deliveries(merchant_id, created_at DESC);

-- ============================================================================
-- RATE LIMITING (enhanced tracking)
-- ============================================================================

CREATE TABLE rate_limit_counters (
  id VARCHAR(255) PRIMARY KEY, -- Format: {type}:{identifier}:{window}
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE CASCADE,
  counter INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_window ON rate_limit_counters(window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limit_merchant ON rate_limit_counters(merchant_id);

-- Rate limit violations log
CREATE TABLE rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) REFERENCES merchants(id) ON DELETE CASCADE,
  identifier VARCHAR(255) NOT NULL, -- IP, API key, etc.
  limit_type VARCHAR(50) NOT NULL, -- 'api', 'webhook', 'auth', etc.
  limit_value INTEGER NOT NULL,
  current_value INTEGER NOT NULL,
  endpoint VARCHAR(255),
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_violations_merchant ON rate_limit_violations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_rate_violations_created ON rate_limit_violations(created_at);

-- ============================================================================
-- BULK OPERATIONS
-- ============================================================================

CREATE TYPE bulk_operation_type AS ENUM ('IMPORT', 'EXPORT', 'UPDATE', 'DELETE');
CREATE TYPE bulk_operation_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE bulk_operations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES merchant_staff(id) ON DELETE SET NULL,
  operation_type bulk_operation_type NOT NULL,
  resource_type VARCHAR(50) NOT NULL, -- 'products', 'customers', etc.
  status bulk_operation_status NOT NULL DEFAULT 'PENDING',
  file_url VARCHAR(2048), -- S3/storage URL for import file
  result_url VARCHAR(2048), -- URL for export result or error report
  total_records INTEGER,
  processed_records INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]', -- Array of {row, field, error}
  options JSONB NOT NULL DEFAULT '{}', -- Operation-specific options
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bulk_ops_merchant ON bulk_operations(merchant_id);
CREATE INDEX IF NOT EXISTS idx_bulk_ops_status ON bulk_operations(status);
CREATE INDEX IF NOT EXISTS idx_bulk_ops_created ON bulk_operations(created_at);

-- ============================================================================
-- GDPR / DATA EXPORT & DELETION
-- ============================================================================

CREATE TYPE data_request_type AS ENUM ('EXPORT', 'DELETE');
CREATE TYPE data_request_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE data_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  request_type data_request_type NOT NULL,
  status data_request_status NOT NULL DEFAULT 'PENDING',
  requester_email VARCHAR(255),
  requester_phone VARCHAR(50),
  verification_code VARCHAR(10),
  verified_at TIMESTAMPTZ,
  result_url VARCHAR(2048), -- For export downloads
  expires_at TIMESTAMPTZ, -- Download link expiry
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_requests_merchant ON data_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_data_requests_status ON data_requests(status);
CREATE INDEX IF NOT EXISTS idx_data_requests_customer ON data_requests(customer_id);

-- ============================================================================
-- NOTIFICATION PREFERENCES
-- ============================================================================

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES merchant_staff(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'low_stock', 'new_order', 'daily_summary', etc.
  channel VARCHAR(20) NOT NULL, -- 'email', 'sms', 'whatsapp', 'push'
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}', -- Channel-specific config (thresholds, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, staff_id, notification_type, channel)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_merchant ON notification_preferences(merchant_id);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_staff ON notification_preferences(staff_id);

-- Notification queue
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES merchant_staff(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  recipient VARCHAR(255) NOT NULL, -- email, phone, etc.
  subject VARCHAR(500),
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  status notification_status NOT NULL DEFAULT 'PENDING',
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_queue_status ON notification_queue(status, scheduled_for) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_notif_queue_merchant ON notification_queue(merchant_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_merchant_staff_updated_at BEFORE UPDATE ON merchant_staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bulk_operations_updated_at BEFORE UPDATE ON bulk_operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Function to clean up old audit logs (keep 90 days by default)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old webhook deliveries (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_deliveries(days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM webhook_deliveries WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired rate limit counters
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limit_counters WHERE window_end < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired staff sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM staff_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
