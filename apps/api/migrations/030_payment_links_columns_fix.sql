-- Migration 030 - Ensure payment_links columns exist (schema drift fix)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_links') THEN
    ALTER TABLE payment_links
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50),
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS allowed_methods payment_method_type[] DEFAULT '{INSTAPAY,BANK_TRANSFER,VODAFONE_CASH}',
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS status payment_link_status DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS link_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Backfill link_code for legacy rows if missing
    UPDATE payment_links
    SET link_code = generate_payment_link_code()
    WHERE link_code IS NULL;
  END IF;
END $$;
