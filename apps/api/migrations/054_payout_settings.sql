-- Migration: Add payout settings columns to merchants table
-- Date: 2026-02-05
-- Description: Adds Egypt payment method fields for merchant payouts

-- Add payout columns if they don't exist
DO $$ 
BEGIN
    -- InstaPay alias
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'payout_instapay_alias'
    ) THEN
        ALTER TABLE merchants ADD COLUMN payout_instapay_alias VARCHAR(100);
    END IF;

    -- Vodafone Cash number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'payout_vodafone_cash'
    ) THEN
        ALTER TABLE merchants ADD COLUMN payout_vodafone_cash VARCHAR(20);
    END IF;

    -- Bank name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'payout_bank_name'
    ) THEN
        ALTER TABLE merchants ADD COLUMN payout_bank_name VARCHAR(100);
    END IF;

    -- Bank account holder name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'payout_bank_account_holder'
    ) THEN
        ALTER TABLE merchants ADD COLUMN payout_bank_account_holder VARCHAR(200);
    END IF;

    -- Bank account number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'payout_bank_account'
    ) THEN
        ALTER TABLE merchants ADD COLUMN payout_bank_account VARCHAR(50);
    END IF;

    -- Bank IBAN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'payout_bank_iban'
    ) THEN
        ALTER TABLE merchants ADD COLUMN payout_bank_iban VARCHAR(50);
    END IF;

    -- Preferred payout method
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'merchants' AND column_name = 'payout_preferred_method'
    ) THEN
        ALTER TABLE merchants ADD COLUMN payout_preferred_method VARCHAR(20) DEFAULT 'INSTAPAY';
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN merchants.payout_instapay_alias IS 'InstaPay alias for receiving payments';
COMMENT ON COLUMN merchants.payout_vodafone_cash IS 'Vodafone Cash phone number for receiving payments';
COMMENT ON COLUMN merchants.payout_bank_name IS 'Bank name for bank transfer payouts';
COMMENT ON COLUMN merchants.payout_bank_account_holder IS 'Bank account holder name';
COMMENT ON COLUMN merchants.payout_bank_account IS 'Bank account number';
COMMENT ON COLUMN merchants.payout_bank_iban IS 'IBAN for international transfers';
COMMENT ON COLUMN merchants.payout_preferred_method IS 'Preferred payout method: INSTAPAY, VODAFONE_CASH, BANK_TRANSFER';
