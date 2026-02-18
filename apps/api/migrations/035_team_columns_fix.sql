-- Migration 035 - Ensure merchant_staff columns exist (schema drift fix)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') THEN
    CREATE TYPE staff_role AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_status') THEN
    CREATE TYPE staff_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITE');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_staff') THEN
    ALTER TABLE merchant_staff
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
      ADD COLUMN IF NOT EXISTS role staff_role NOT NULL DEFAULT 'AGENT',
      ADD COLUMN IF NOT EXISTS status staff_status NOT NULL DEFAULT 'PENDING_INVITE',
      ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255),
      ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_merchant_email ON merchant_staff(merchant_id, email);
CREATE INDEX IF NOT EXISTS idx_staff_invite_token ON merchant_staff(invite_token) WHERE invite_token IS NOT NULL;
