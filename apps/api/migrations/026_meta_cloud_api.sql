-- ============================================================================
-- Migration: 026_meta_cloud_api.sql
-- Description: Migrate from Twilio to Meta Cloud API for WhatsApp
-- Author: Tash8eel Team
-- Date: 2026-01-28
-- ============================================================================

-- ============================================================================
-- 1. UPDATE merchant_phone_numbers for Meta Cloud API
-- Add phone_number_id and waba_id to metadata, update provider default
-- ============================================================================

-- Change default provider from 'twilio' to 'meta'
ALTER TABLE merchant_phone_numbers ALTER COLUMN provider SET DEFAULT 'meta';

-- Update existing records from twilio to meta
UPDATE merchant_phone_numbers SET provider = 'meta' WHERE provider = 'twilio';

-- The whatsapp_number column was storing Twilio format: whatsapp:+123
-- For Meta, we store plain E.164: +20123456789
-- Normalize existing data (strip whatsapp: prefix)
UPDATE merchant_phone_numbers 
SET whatsapp_number = REPLACE(whatsapp_number, 'whatsapp:', '')
WHERE whatsapp_number LIKE 'whatsapp:%';

-- Update comment
COMMENT ON COLUMN merchant_phone_numbers.whatsapp_number IS 'E.164 phone number: +201234567890 (Meta Cloud API format)';
COMMENT ON COLUMN merchant_phone_numbers.is_sandbox IS 'True when using Meta test number for testing';

-- ============================================================================
-- 2. CREATE new whatsapp_message_log table (replaces twilio_message_log)
-- Generic — not tied to any provider
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  wa_message_id VARCHAR(100) NOT NULL, -- wamid.xxx (Meta) or legacy Twilio SID
  waba_id VARCHAR(100),               -- WhatsApp Business Account ID
  phone_number_id VARCHAR(100),       -- Meta Phone Number ID
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number VARCHAR(50) NOT NULL,
  to_number VARCHAR(50) NOT NULL,
  body TEXT,
  num_media INTEGER DEFAULT 0,
  media_ids JSONB DEFAULT '[]',            -- Meta media IDs
  media_content_types JSONB DEFAULT '[]',
  status VARCHAR(30) DEFAULT 'received',   -- received, sent, delivered, read, failed
  error_code VARCHAR(20),
  error_message TEXT,
  -- Location data
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  location_label TEXT,
  -- Webhook data
  webhook_received_at TIMESTAMPTZ,
  status_callback_received_at TIMESTAMPTZ,
  raw_webhook_payload JSONB,
  raw_status_payload JSONB,
  -- Billing (Meta conversation pricing)
  conversation_id_meta VARCHAR(100),       -- Meta conversation ID
  conversation_origin VARCHAR(50),          -- user_initiated, business_initiated, referral_conversion, etc.
  is_billable BOOLEAN DEFAULT false,
  pricing_category VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on wa_message_id + direction (same wamid for sent vs status)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_log_message_id_unique 
  ON whatsapp_message_log(wa_message_id) WHERE direction = 'inbound';

CREATE INDEX IF NOT EXISTS idx_wa_log_wa_message_id ON whatsapp_message_log(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_wa_log_message_id ON whatsapp_message_log(message_id);
CREATE INDEX IF NOT EXISTS idx_wa_log_status ON whatsapp_message_log(status) WHERE status NOT IN ('delivered', 'read');
CREATE INDEX IF NOT EXISTS idx_wa_log_from ON whatsapp_message_log(from_number);
CREATE INDEX IF NOT EXISTS idx_wa_log_phone_number_id ON whatsapp_message_log(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_wa_log_created ON whatsapp_message_log(created_at);
CREATE INDEX IF NOT EXISTS idx_wa_log_waba ON whatsapp_message_log(waba_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_wa_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_whatsapp_message_log_updated') THEN
    CREATE TRIGGER tr_whatsapp_message_log_updated
      BEFORE UPDATE ON whatsapp_message_log
      FOR EACH ROW EXECUTE FUNCTION update_wa_log_updated_at();
  END IF;
END $$;

-- ============================================================================
-- 3. MIGRATE data from twilio_message_log → whatsapp_message_log
-- Copy existing message history so we don't lose anything
-- ============================================================================

INSERT INTO whatsapp_message_log (
  id, message_id, wa_message_id, waba_id, phone_number_id, direction,
  from_number, to_number, body, num_media, media_ids, media_content_types,
  status, error_code, error_message,
  latitude, longitude, location_label,
  webhook_received_at, status_callback_received_at,
  raw_webhook_payload, raw_status_payload,
  created_at, updated_at
)
SELECT 
  id, message_id, message_sid, NULL, NULL, direction,
  REPLACE(from_number, 'whatsapp:', ''),
  REPLACE(to_number, 'whatsapp:', ''),
  body, num_media, media_urls, media_content_types,
  status, error_code, error_message,
  latitude, longitude, location_label,
  webhook_received_at, status_callback_received_at,
  raw_webhook_payload, raw_status_payload,
  created_at, updated_at
FROM twilio_message_log
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. ADD add-on purchase tables for AI calls and message bundles
-- Merchants can buy extra AI calls or messages without changing plans
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  addon_type VARCHAR(50) NOT NULL CHECK (addon_type IN ('AI_CALLS', 'MESSAGES')),
  tier_id VARCHAR(50) NOT NULL,          -- e.g. 'STANDARD', 'PROFESSIONAL', 'UNLIMITED'
  quantity INTEGER NOT NULL DEFAULT 1,
  price_cents INTEGER NOT NULL,          -- price in cents (EGP)
  currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  payment_reference VARCHAR(255),        -- Payment gateway ref
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_addons_merchant ON merchant_addons(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_addons_active ON merchant_addons(merchant_id, addon_type) 
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_merchant_addons_expires ON merchant_addons(expires_at) 
  WHERE status = 'active';

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_merchant_addons_updated') THEN
    CREATE TRIGGER tr_merchant_addons_updated
      BEFORE UPDATE ON merchant_addons
      FOR EACH ROW EXECUTE FUNCTION update_wa_log_updated_at();
  END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE whatsapp_message_log IS 'Complete WhatsApp message lifecycle log — provider-agnostic (Meta Cloud API)';
COMMENT ON COLUMN whatsapp_message_log.wa_message_id IS 'Meta wamid.xxx or legacy Twilio SID';
COMMENT ON COLUMN whatsapp_message_log.waba_id IS 'WhatsApp Business Account ID from Meta';
COMMENT ON COLUMN whatsapp_message_log.phone_number_id IS 'Meta Phone Number ID for the business line';
COMMENT ON COLUMN whatsapp_message_log.conversation_id_meta IS 'Meta conversation ID for billing tracking';
COMMENT ON COLUMN whatsapp_message_log.is_billable IS 'Whether this conversation was billable per Meta pricing';

COMMENT ON TABLE merchant_addons IS 'Add-on purchases: extra AI calls or WhatsApp messages beyond base plan';
COMMENT ON COLUMN merchant_addons.addon_type IS 'AI_CALLS = extra AI calls/day, MESSAGES = extra WhatsApp messages/month';
COMMENT ON COLUMN merchant_addons.tier_id IS 'Tier from entitlements: BASIC, STANDARD, PROFESSIONAL, UNLIMITED';
