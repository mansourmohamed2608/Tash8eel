-- Migration 114: Chain execution foundations
-- Scope:
-- 1) Delivery Execution 360 foundations
-- 2) Connector Runtime v2 foundations
-- 3) HQ / Franchise governance foundations
-- 4) Minimal control-plane governance foundations

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1) DELIVERY EXECUTION 360
-- ============================================

CREATE TABLE IF NOT EXISTS delivery_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id VARCHAR(255),
  event_type VARCHAR(64) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'system',
  status VARCHAR(32) NOT NULL DEFAULT 'RECORDED',
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_merchant_order_time
  ON delivery_execution_events (merchant_id, order_id, event_time DESC);

CREATE INDEX IF NOT EXISTS idx_delivery_events_merchant_type_time
  ON delivery_execution_events (merchant_id, event_type, event_time DESC);

CREATE TABLE IF NOT EXISTS delivery_pod_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id VARCHAR(255),
  proof_type VARCHAR(32) NOT NULL DEFAULT 'note',
  proof_url TEXT,
  proof_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_by VARCHAR(64),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispute_status VARCHAR(20) NOT NULL DEFAULT 'NONE',
  disputed_at TIMESTAMPTZ,
  dispute_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_pod_merchant_order
  ON delivery_pod_records (merchant_id, order_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS delivery_location_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id VARCHAR(255),
  latitude DECIMAL(10, 7) NOT NULL,
  longitude DECIMAL(10, 7) NOT NULL,
  accuracy_meters DECIMAL(10, 2),
  speed_kmh DECIMAL(10, 2),
  heading_deg DECIMAL(10, 2),
  source VARCHAR(32) NOT NULL DEFAULT 'driver_app',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_location_merchant_order_time
  ON delivery_location_timeline (merchant_id, order_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS delivery_sla_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id VARCHAR(255) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id VARCHAR(255),
  sla_type VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('OK', 'AT_RISK', 'BREACHED')),
  target_at TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  minutes_delta INTEGER,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_sla_merchant_order
  ON delivery_sla_events (merchant_id, order_id, observed_at DESC);

-- ============================================
-- 2) CONNECTOR RUNTIME V2
-- ============================================

CREATE TABLE IF NOT EXISTS connector_runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'RETRY', 'DEAD_LETTER')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_runtime_events_merchant_status_retry
  ON connector_runtime_events (merchant_id, status, next_retry_at ASC);

CREATE INDEX IF NOT EXISTS idx_connector_runtime_events_endpoint
  ON connector_runtime_events (endpoint_id, created_at DESC);

CREATE TABLE IF NOT EXISTS connector_runtime_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runtime_event_id UUID NOT NULL REFERENCES connector_runtime_events(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ,
  moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replayed_at TIMESTAMPTZ,
  replay_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REPLAYED', 'DISCARDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (runtime_event_id)
);

CREATE INDEX IF NOT EXISTS idx_connector_runtime_dlq_merchant_status
  ON connector_runtime_dlq (merchant_id, status, moved_to_dlq_at DESC);

CREATE TABLE IF NOT EXISTS connector_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  endpoint_id UUID REFERENCES integration_endpoints(id) ON DELETE SET NULL,
  scope VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  drift_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_recon_runs_merchant_status
  ON connector_reconciliation_runs (merchant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS connector_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES connector_reconciliation_runs(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_key VARCHAR(255) NOT NULL,
  source_hash TEXT,
  target_hash TEXT,
  drift_type VARCHAR(32) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_recon_items_run_status
  ON connector_reconciliation_items (run_id, status, created_at DESC);

-- ============================================
-- 3) HQ / FRANCHISE GOVERNANCE FOUNDATION
-- ============================================

CREATE TABLE IF NOT EXISTS merchant_org_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES merchant_org_units(id) ON DELETE SET NULL,
  unit_type VARCHAR(16) NOT NULL CHECK (unit_type IN ('HQ', 'BRAND', 'REGION', 'BRANCH')),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL,
  branch_id VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, unit_type, code)
);

CREATE INDEX IF NOT EXISTS idx_org_units_merchant_parent
  ON merchant_org_units (merchant_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_org_units_merchant_branch
  ON merchant_org_units (merchant_id, branch_id);

CREATE TABLE IF NOT EXISTS merchant_org_policy_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES merchant_org_units(id) ON DELETE CASCADE,
  policy_key VARCHAR(100) NOT NULL,
  policy_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  inheritance_mode VARCHAR(20) NOT NULL DEFAULT 'OVERRIDE'
    CHECK (inheritance_mode IN ('MERGE', 'OVERRIDE', 'LOCKED')),
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_policy_bindings_unit_key
  ON merchant_org_policy_bindings (merchant_id, unit_id, policy_key, version DESC);

CREATE TABLE IF NOT EXISTS merchant_org_staff_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES merchant_org_units(id) ON DELETE CASCADE,
  staff_id VARCHAR(64) NOT NULL,
  role_scope VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
    CHECK (role_scope IN ('OWNER', 'ADMIN', 'MANAGER', 'ANALYST', 'MEMBER')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, unit_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_org_staff_scopes_staff
  ON merchant_org_staff_scopes (merchant_id, staff_id, status);

-- ============================================
-- 4) MINIMAL CONTROL-PLANE FOUNDATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS control_policy_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  policy_dsl JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(64),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_control_policy_sets_merchant_status
  ON control_policy_sets (merchant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS control_policy_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  policy_set_id UUID REFERENCES control_policy_sets(id) ON DELETE SET NULL,
  simulation_input JSONB NOT NULL,
  simulation_result JSONB NOT NULL,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_policy_simulations_merchant
  ON control_policy_simulations (merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS planner_trigger_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('EVENT', 'SCHEDULED', 'ON_DEMAND', 'ESCALATION')),
  trigger_key VARCHAR(120) NOT NULL,
  budget_ai_calls_daily INTEGER NOT NULL DEFAULT 0,
  budget_tokens_daily INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, trigger_type, trigger_key)
);

CREATE INDEX IF NOT EXISTS idx_planner_trigger_policies_merchant
  ON planner_trigger_policies (merchant_id, trigger_type, trigger_key);

CREATE TABLE IF NOT EXISTS planner_run_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  trigger_type VARCHAR(20) NOT NULL,
  trigger_key VARCHAR(120) NOT NULL,
  requested_by VARCHAR(64),
  budget_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_status VARCHAR(20) NOT NULL DEFAULT 'STARTED'
    CHECK (run_status IN ('STARTED', 'COMPLETED', 'FAILED', 'SKIPPED')),
  reason TEXT,
  context_digest JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_tokens INTEGER NOT NULL DEFAULT 0,
  cost_ai_calls INTEGER NOT NULL DEFAULT 0,
  correlation_id VARCHAR(128),
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_run_ledger_merchant_status
  ON planner_run_ledger (merchant_id, run_status, started_at DESC);
