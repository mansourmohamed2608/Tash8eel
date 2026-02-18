-- Migration 029 - Payment link preferences for auto-send after order confirmation

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS auto_payment_link_on_confirm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_customer_contact_for_payment_link BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_link_channel VARCHAR(20) DEFAULT 'WHATSAPP';
