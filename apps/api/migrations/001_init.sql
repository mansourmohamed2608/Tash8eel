-- Operations Agent - Initial Database Schema
-- PostgreSQL 16+

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for semantic search
EXCEPTION WHEN undefined_file THEN
  RAISE NOTICE 'pgvector extension not available, skipping';
END
$$;

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_category') THEN
    CREATE TYPE merchant_category AS ENUM ('CLOTHES', 'FOOD', 'SUPERMARKET', 'GENERIC');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_state') THEN
    CREATE TYPE conversation_state AS ENUM (
      'GREETING',
      'COLLECTING_ITEMS',
      'COLLECTING_VARIANTS',
      'COLLECTING_CUSTOMER_INFO',
      'COLLECTING_ADDRESS',
      'NEGOTIATING',
      'CONFIRMING_ORDER',
      'ORDER_PLACED',
      'TRACKING',
      'FOLLOWUP',
      'CLOSED'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('DRAFT', 'CONFIRMED', 'BOOKED', 'SHIPPED', 'DELIVERED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_status') THEN
    CREATE TYPE event_status AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dlq_status') THEN
    CREATE TYPE dlq_status AS ENUM ('PENDING', 'RETRYING', 'RESOLVED', 'EXHAUSTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_delivery_status') THEN
    CREATE TYPE message_delivery_status AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');
  END IF;
END $$;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Merchants table
CREATE TABLE IF NOT EXISTS merchants (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category merchant_category NOT NULL DEFAULT 'GENERIC',
  config JSONB NOT NULL DEFAULT '{}',
  branding JSONB NOT NULL DEFAULT '{}',
  negotiation_rules JSONB NOT NULL DEFAULT '{}',
  delivery_rules JSONB NOT NULL DEFAULT '{}',
  daily_token_budget INTEGER NOT NULL DEFAULT 100000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Merchant API Keys for authentication
CREATE TABLE IF NOT EXISTS merchant_api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(10) NOT NULL,
  name VARCHAR(100),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON merchant_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_merchant ON merchant_api_keys(merchant_id);

-- Token usage tracking
CREATE TABLE IF NOT EXISTS merchant_token_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  llm_calls INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, usage_date)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_token_usage') THEN
    ALTER TABLE merchant_token_usage
      ADD COLUMN IF NOT EXISTS usage_date DATE,
      ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS llm_calls INTEGER DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'merchant_token_usage'
      AND column_name = 'usage_date'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_token_usage_merchant_date
      ON merchant_token_usage(merchant_id, usage_date);
  END IF;
END $$;

-- ============================================================================
-- CATALOG TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sku VARCHAR(100),
  name_ar VARCHAR(500) NOT NULL,
  name_en VARCHAR(500),
  description_ar TEXT,
  description_en TEXT,
  category VARCHAR(100),
  base_price DECIMAL(10,2) NOT NULL,
  min_price DECIMAL(10,2),
  variants JSONB NOT NULL DEFAULT '[]',
  options JSONB NOT NULL DEFAULT '[]',
  tags TEXT[],
  embedding VECTOR(1536), -- For semantic search (if pgvector enabled)
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, sku)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'catalog_items') THEN
    ALTER TABLE catalog_items
      ADD COLUMN IF NOT EXISTS tags TEXT[],
      ADD COLUMN IF NOT EXISTS embedding VECTOR(1536),
      ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS name_ar VARCHAR(500),
      ADD COLUMN IF NOT EXISTS name_en VARCHAR(500),
      ADD COLUMN IF NOT EXISTS description_ar TEXT,
      ADD COLUMN IF NOT EXISTS description_en TEXT,
      ADD COLUMN IF NOT EXISTS category VARCHAR(100),
      ADD COLUMN IF NOT EXISTS base_price DECIMAL(10,2),
      ADD COLUMN IF NOT EXISTS min_price DECIMAL(10,2);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_merchant ON catalog_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_catalog_name_ar ON catalog_items USING gin(name_ar gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_name_en ON catalog_items USING gin(name_en gin_trgm_ops);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'catalog_items' AND column_name = 'tags'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_catalog_tags ON catalog_items USING gin(tags);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_catalog_category ON catalog_items(merchant_id, category);
CREATE INDEX IF NOT EXISTS idx_catalog_available ON catalog_items(merchant_id, is_available);

-- ============================================================================
-- CUSTOMER & CONVERSATION TABLES
-- ============================================================================

-- Known areas for address normalization
CREATE TABLE IF NOT EXISTS known_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city VARCHAR(100) NOT NULL,
  area_name_ar VARCHAR(255) NOT NULL,
  area_name_en VARCHAR(255),
  area_aliases TEXT[] NOT NULL DEFAULT '{}',
  delivery_zone VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(city, area_name_ar)
);

CREATE INDEX IF NOT EXISTS idx_known_areas_city ON known_areas(city);
CREATE INDEX IF NOT EXISTS idx_known_areas_aliases ON known_areas USING gin(area_aliases);

-- Customers (for memory/recognition)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sender_id VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  name VARCHAR(255),
  address JSONB,
  preferences JSONB NOT NULL DEFAULT '{}',
  total_orders INTEGER NOT NULL DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, sender_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS sender_id VARCHAR(255);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_merchant ON customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'sender_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_customers_sender ON customers(merchant_id, sender_id);
  END IF;
END $$;

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(100) PRIMARY KEY,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  sender_id VARCHAR(255) NOT NULL,
  state conversation_state NOT NULL DEFAULT 'GREETING',
  context JSONB NOT NULL DEFAULT '{}',
  cart JSONB NOT NULL DEFAULT '{"items": [], "subtotal": 0, "discount": 0, "total": 0}',
  collected_info JSONB NOT NULL DEFAULT '{}',
  missing_slots TEXT[] NOT NULL DEFAULT '{}',
  compressed_history JSONB, -- For memory compression
  last_message_at TIMESTAMPTZ,
  followup_count INTEGER NOT NULL DEFAULT 0,
  next_followup_at TIMESTAMPTZ,
  human_takeover BOOLEAN NOT NULL DEFAULT false,
  human_takeover_at TIMESTAMPTZ,
  human_operator_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversations') THEN
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS sender_id VARCHAR(255);
    ALTER TABLE conversations
      ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT false;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'conversations' AND column_name = 'is_human_takeover'
    ) THEN
      UPDATE conversations
      SET human_takeover = is_human_takeover
      WHERE human_takeover IS NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_merchant ON conversations(merchant_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'sender_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_conversations_sender ON conversations(merchant_id, sender_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conversations_state ON conversations(state);
CREATE INDEX IF NOT EXISTS idx_conversations_followup ON conversations(next_followup_at) WHERE next_followup_at IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'human_takeover'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_conversations_takeover ON conversations(human_takeover) WHERE human_takeover = true;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'conversations' AND column_name = 'is_human_takeover'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_conversations_takeover ON conversations(is_human_takeover) WHERE is_human_takeover = true;
  END IF;
END $$;

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id VARCHAR(100) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_message_id VARCHAR(255),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_id VARCHAR(255) NOT NULL,
  text TEXT,
  attachments JSONB NOT NULL DEFAULT '[]',
  metadata JSONB NOT NULL DEFAULT '{}',
  delivery_status message_delivery_status NOT NULL DEFAULT 'PENDING',
  delivery_status_updated_at TIMESTAMPTZ,
  llm_used BOOLEAN NOT NULL DEFAULT false,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_delivery_status ON messages(delivery_status) WHERE delivery_status NOT IN ('DELIVERED', 'READ');
CREATE INDEX IF NOT EXISTS idx_messages_provider_id ON messages(merchant_id, provider_message_id);

-- ============================================================================
-- ORDER & SHIPMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100) NOT NULL REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_number VARCHAR(50) NOT NULL,
  status order_status NOT NULL DEFAULT 'DRAFT',
  items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  delivery_address JSONB,
  delivery_notes TEXT,
  delivery_preference VARCHAR(50),
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, order_number),
  UNIQUE(idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_conversation ON orders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  tracking_id VARCHAR(100),
  courier VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  status_description TEXT,
  status_history JSONB NOT NULL DEFAULT '[]',
  estimated_delivery TIMESTAMPTZ,
  actual_delivery TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_id);
CREATE INDEX IF NOT EXISTS idx_shipments_merchant ON shipments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);

-- ============================================================================
-- EVENT & DLQ TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(255) NOT NULL,
  merchant_id VARCHAR(50),
  payload JSONB NOT NULL,
  correlation_id VARCHAR(100),
  status event_status NOT NULL DEFAULT 'PENDING',
  processed_at TIMESTAMPTZ,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox_events(created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_correlation ON outbox_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_outbox_merchant ON outbox_events(merchant_id);

CREATE TABLE IF NOT EXISTS dlq_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_event_id UUID REFERENCES outbox_events(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  error TEXT NOT NULL,
  stack TEXT,
  correlation_id VARCHAR(100),
  merchant_id VARCHAR(50),
  status dlq_status NOT NULL DEFAULT 'PENDING',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  next_retry_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_status ON dlq_events(status);
CREATE INDEX IF NOT EXISTS idx_dlq_next_retry ON dlq_events(next_retry_at) WHERE status IN ('PENDING', 'RETRYING');

-- ============================================================================
-- REPORTING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  summary JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, report_date)
);

CREATE INDEX IF NOT EXISTS idx_reports_merchant_date ON merchant_reports(merchant_id, report_date);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_dlq_events_updated_at BEFORE UPDATE ON dlq_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_merchant_token_usage_updated_at BEFORE UPDATE ON merchant_token_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_catalog_items_updated_at BEFORE UPDATE ON catalog_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA: Known Areas (Cairo, Giza, Alexandria)
-- ============================================================================

INSERT INTO known_areas (city, area_name_ar, area_name_en, area_aliases) VALUES
-- Cairo
('القاهرة', 'التجمع الخامس', 'Fifth Settlement', ARRAY['التجمع', '5th settlement', 'new cairo']),
('القاهرة', 'مدينة نصر', 'Nasr City', ARRAY['نصر', 'nasr city']),
('القاهرة', 'المعادي', 'Maadi', ARRAY['معادي', 'maadi']),
('القاهرة', 'مصر الجديدة', 'Heliopolis', ARRAY['هليوبوليس', 'heliopolis']),
('القاهرة', 'الزمالك', 'Zamalek', ARRAY['زمالك', 'zamalek']),
('القاهرة', 'المهندسين', 'Mohandessin', ARRAY['مهندسين', 'mohandessin']),
('القاهرة', 'الدقي', 'Dokki', ARRAY['دقي', 'dokki']),
('القاهرة', 'شبرا', 'Shubra', ARRAY['shubra']),
('القاهرة', 'عين شمس', 'Ain Shams', ARRAY['ain shams']),
('القاهرة', 'الرحاب', 'Rehab City', ARRAY['رحاب', 'rehab']),
('القاهرة', 'مدينتي', 'Madinaty', ARRAY['madinaty']),
('القاهرة', 'العاصمة الإدارية', 'New Administrative Capital', ARRAY['العاصمة', 'NAC', 'new capital']),
-- Giza
('الجيزة', 'الشيخ زايد', 'Sheikh Zayed', ARRAY['زايد', 'sheikh zayed', 'zayed']),
('الجيزة', '6 أكتوبر', '6th of October', ARRAY['اكتوبر', '6 october', 'october']),
('الجيزة', 'الهرم', 'Haram', ARRAY['هرم', 'haram']),
('الجيزة', 'فيصل', 'Faisal', ARRAY['faisal']),
('الجيزة', 'العجوزة', 'Agouza', ARRAY['عجوزة', 'agouza']),
-- Alexandria
('الإسكندرية', 'سموحة', 'Smouha', ARRAY['smouha']),
('الإسكندرية', 'ستانلي', 'Stanley', ARRAY['stanley']),
('الإسكندرية', 'سيدي جابر', 'Sidi Gaber', ARRAY['sidi gaber']),
('الإسكندرية', 'المنتزه', 'Montazah', ARRAY['montazah']),
('الإسكندرية', 'سان ستيفانو', 'San Stefano', ARRAY['san stefano']);
