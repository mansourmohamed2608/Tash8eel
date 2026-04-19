-- ============================================================================
-- Migration: 005_twilio_whatsapp.sql
-- Description: Twilio WhatsApp integration tables
-- Author: Tash8eel Team
-- Date: 2026-01-21
-- ============================================================================

-- ============================================================================
-- MERCHANT PHONE NUMBERS (maps WhatsApp numbers to merchants)
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_phone_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL, -- E.164 format: +1234567890
  whatsapp_number VARCHAR(50) NOT NULL, -- Twilio format: whatsapp:+1234567890
  provider VARCHAR(50) NOT NULL DEFAULT 'twilio', -- twilio, meta, etc.
  display_name VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_sandbox BOOLEAN NOT NULL DEFAULT true, -- true for Twilio sandbox
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(whatsapp_number)
);

CREATE INDEX IF NOT EXISTS idx_merchant_phones_merchant ON merchant_phone_numbers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_phones_whatsapp ON merchant_phone_numbers(whatsapp_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_merchant_phones_phone ON merchant_phone_numbers(phone_number) WHERE is_active = true;

-- ============================================================================
-- VOICE TRANSCRIPTIONS (stores transcription results with message linkage)
-- Enhanced from 002 - add missing columns
-- ============================================================================

CREATE TABLE IF NOT EXISTS voice_transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id VARCHAR(100) NOT NULL,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL DEFAULT 'whisper', -- whisper, google, azure
  original_media_url TEXT,
  media_content_type VARCHAR(100),
  duration_seconds DECIMAL(10,2),
  transcript TEXT NOT NULL,
  confidence DECIMAL(4,3), -- 0.000 to 1.000
  language VARCHAR(10) NOT NULL DEFAULT 'ar',
  segments JSONB, -- Array of {start, end, text, confidence}
  raw_response JSONB, -- Full provider response for debugging
  processing_time_ms INTEGER,
  error_message TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns that may be missing from earlier migration (002)
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(100);
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(50);
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS original_media_url TEXT;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS media_content_type VARCHAR(100);
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS segments JSONB;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS raw_response JSONB;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed';

CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_message ON voice_transcriptions(message_id);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_transcriptions' AND column_name = 'conversation_id') THEN
    CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_conversation ON voice_transcriptions(conversation_id);
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'voice_transcriptions' AND column_name = 'merchant_id') THEN
    CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_merchant ON voice_transcriptions(merchant_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_status ON voice_transcriptions(status) WHERE status != 'completed';

-- ============================================================================
-- TWILIO MESSAGE LOG (tracks all Twilio-specific message data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS twilio_message_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  message_sid VARCHAR(50) NOT NULL UNIQUE, -- Twilio MessageSid
  account_sid VARCHAR(50) NOT NULL,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number VARCHAR(50) NOT NULL,
  to_number VARCHAR(50) NOT NULL,
  body TEXT,
  num_media INTEGER DEFAULT 0,
  media_urls JSONB DEFAULT '[]',
  media_content_types JSONB DEFAULT '[]',
  status VARCHAR(30) DEFAULT 'received', -- received, queued, sending, sent, delivered, failed, undelivered, read
  error_code VARCHAR(10),
  error_message TEXT,
  price DECIMAL(10,6),
  price_unit VARCHAR(10),
  -- Location data if present
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  location_label TEXT,
  -- Webhook data
  webhook_received_at TIMESTAMPTZ,
  status_callback_received_at TIMESTAMPTZ,
  raw_webhook_payload JSONB,
  raw_status_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_twilio_log_message_sid ON twilio_message_log(message_sid);
CREATE INDEX IF NOT EXISTS idx_twilio_log_message_id ON twilio_message_log(message_id);
CREATE INDEX IF NOT EXISTS idx_twilio_log_status ON twilio_message_log(status) WHERE status NOT IN ('delivered', 'read');
CREATE INDEX IF NOT EXISTS idx_twilio_log_from ON twilio_message_log(from_number);
CREATE INDEX IF NOT EXISTS idx_twilio_log_created ON twilio_message_log(created_at);

-- ============================================================================
-- SEED DATA: Default sandbox merchant phone mapping (conditional)
-- ============================================================================

-- Insert a default sandbox phone mapping for testing (only if merchant exists)
-- The Twilio sandbox number: whatsapp:+14155238886
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM merchants WHERE id = 'merchant_001') THEN
    INSERT INTO merchant_phone_numbers (
      merchant_id,
      phone_number,
      whatsapp_number,
      provider,
      display_name,
      is_active,
      is_sandbox,
      metadata
    ) VALUES (
      'merchant_001',
      '+14155238886',
      'whatsapp:+14155238886',
      'twilio',
      'Twilio Sandbox',
      true,
      true,
      '{"sandbox_code": "join <your-sandbox-code>"}'::jsonb
    ) ON CONFLICT (whatsapp_number) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_twilio_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER tr_merchant_phone_numbers_updated
  BEFORE UPDATE ON merchant_phone_numbers
  FOR EACH ROW EXECUTE FUNCTION update_twilio_updated_at();

CREATE TRIGGER tr_twilio_message_log_updated
  BEFORE UPDATE ON twilio_message_log
  FOR EACH ROW EXECUTE FUNCTION update_twilio_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE merchant_phone_numbers IS 'Maps WhatsApp phone numbers to merchants for inbound routing';
COMMENT ON TABLE voice_transcriptions IS 'Stores transcription results for voice messages with full audit trail';
COMMENT ON TABLE twilio_message_log IS 'Complete Twilio message lifecycle log for debugging and analytics';

COMMENT ON COLUMN merchant_phone_numbers.whatsapp_number IS 'Twilio WhatsApp format: whatsapp:+1234567890';
COMMENT ON COLUMN merchant_phone_numbers.is_sandbox IS 'True when using Twilio sandbox for testing';
COMMENT ON COLUMN twilio_message_log.message_sid IS 'Twilio unique message identifier';
COMMENT ON COLUMN twilio_message_log.status IS 'Twilio message status: received, queued, sending, sent, delivered, failed, undelivered, read';
