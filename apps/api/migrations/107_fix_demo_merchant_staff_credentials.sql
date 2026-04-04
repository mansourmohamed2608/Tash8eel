-- Migration 107: Ensure demo-merchant has a working owner login for portal smoke tests.
-- This is idempotent and safe to rerun.

INSERT INTO merchant_staff (
  id,
  merchant_id,
  email,
  name,
  role,
  password_hash,
  status,
  permissions,
  must_change_password,
  failed_login_attempts,
  locked_until,
  invite_token,
  invite_expires_at
)
SELECT
  uuid_generate_v4(),
  'demo-merchant',
  'owner@tash8eel.com',
  'Demo Owner',
  'OWNER',
  '$2b$12$Y1UgS1rRohJOlFbRX0wVU./Q2N0gKWA.hv8bYBSGzmTFOITiEf2Ui',
  'ACTIVE',
  '{"all":true}'::jsonb,
  false,
  0,
  NULL,
  NULL,
  NULL
WHERE EXISTS (SELECT 1 FROM merchants WHERE id = 'demo-merchant')
ON CONFLICT (merchant_id, email) DO UPDATE
SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  status = 'ACTIVE',
  permissions = EXCLUDED.permissions,
  must_change_password = false,
  failed_login_attempts = 0,
  locked_until = NULL,
  invite_token = NULL,
  invite_expires_at = NULL,
  updated_at = NOW();
