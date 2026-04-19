-- Migration 036 - Allow NULL password_hash for pending staff invites

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'merchant_staff' AND column_name = 'password_hash'
  ) THEN
    -- Ensure password_hash can be NULL (invites have no password yet)
    BEGIN
      ALTER TABLE merchant_staff
        ALTER COLUMN password_hash DROP NOT NULL;
    EXCEPTION WHEN others THEN
      -- Ignore if already nullable or constraint doesn't exist
      NULL;
    END;
  END IF;
END $$;
