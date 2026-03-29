-- Migration 099
-- WhatsApp conversation windows for 24-hour conversation billing and routing analytics.
-- Note: the requested partial UNIQUE index on expires_at > NOW() is not valid in PostgreSQL
-- because NOW() is not immutable. Active-window exclusivity is enforced in application code
-- via transaction-scoped advisory locking in UsageGuardService.

CREATE TABLE IF NOT EXISTS whatsapp_conversation_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_phone VARCHAR(30) NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  message_count INTEGER NOT NULL DEFAULT 1,
  ai_replies_count INTEGER NOT NULL DEFAULT 0,
  instant_reply_count INTEGER NOT NULL DEFAULT 0,
  model_4o_count INTEGER NOT NULL DEFAULT 0,
  model_mini_count INTEGER NOT NULL DEFAULT 0,
  is_overage BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_wa_conv_lookup
  ON whatsapp_conversation_windows(merchant_id, customer_phone, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_conv_merchant_month
  ON whatsapp_conversation_windows(merchant_id, opened_at);

CREATE INDEX IF NOT EXISTS idx_wa_conv_cleanup
  ON whatsapp_conversation_windows(expires_at);
