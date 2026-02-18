-- Migration: 020_merchant_preferences.sql
-- Description: Add missing merchant settings columns used by portal settings

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Africa/Cairo',
  ADD COLUMN IF NOT EXISTS auto_response_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_delay_minutes INTEGER DEFAULT 60,
  ADD COLUMN IF NOT EXISTS payment_reminders_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS low_stock_alerts_enabled BOOLEAN DEFAULT true;
