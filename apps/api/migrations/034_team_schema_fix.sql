-- Migration 034 - Team schema fix (merchant_staff and related enums)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') THEN
    CREATE TYPE staff_role AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_status') THEN
    CREATE TYPE staff_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS merchant_staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  role staff_role NOT NULL DEFAULT 'AGENT',
  status staff_status NOT NULL DEFAULT 'PENDING_INVITE',
  permissions JSONB NOT NULL DEFAULT '{}',
  invite_token VARCHAR(255) UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  mfa_secret VARCHAR(255),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_staff_merchant ON merchant_staff(merchant_id);
CREATE INDEX IF NOT EXISTS idx_staff_email ON merchant_staff(email);
CREATE INDEX IF NOT EXISTS idx_staff_status ON merchant_staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_invite_token ON merchant_staff(invite_token) WHERE invite_token IS NOT NULL;

