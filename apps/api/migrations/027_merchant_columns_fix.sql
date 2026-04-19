-- Ensure notification/reporting columns exist on merchants table
-- This is a safety migration for environments that skipped earlier migrations.

ALTER TABLE merchants
ADD COLUMN IF NOT EXISTS whatsapp_reports_enabled BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS report_periods_enabled TEXT[] NOT NULL DEFAULT ARRAY['daily'],
ADD COLUMN IF NOT EXISTS notification_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS auto_response_enabled BOOLEAN DEFAULT true;
