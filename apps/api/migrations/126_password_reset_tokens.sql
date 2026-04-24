-- Migration 126: Add dedicated password reset token fields to merchant_staff
-- Separates password reset lifecycle from invite lifecycle

ALTER TABLE merchant_staff
  ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_staff_password_reset_token
  ON merchant_staff (password_reset_token)
  WHERE password_reset_token IS NOT NULL;
