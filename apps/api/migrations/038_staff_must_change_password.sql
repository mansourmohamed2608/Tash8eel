-- Migration 038 - Staff must change password flag

ALTER TABLE merchant_staff
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE merchant_staff
  ADD COLUMN IF NOT EXISTS temp_password_set_at TIMESTAMPTZ;
