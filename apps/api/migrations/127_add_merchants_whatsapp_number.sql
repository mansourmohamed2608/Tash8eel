-- Migration 127: Add whatsapp_number column to merchants table
-- Fixes webhook routing fallback that requires merchants.whatsapp_number

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_merchants_whatsapp_number
  ON merchants (whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;
