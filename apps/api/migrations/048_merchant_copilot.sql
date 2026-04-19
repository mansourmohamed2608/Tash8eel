-- Migration: 048_merchant_copilot.sql
-- Description: Merchant Copilot (Command Agent) tables
-- Allows merchants to issue text/voice commands via Portal and WhatsApp

-- ============================================================================
-- COPILOT PENDING ACTIONS
-- ============================================================================
-- Tracks actions awaiting merchant confirmation before execution
CREATE TABLE IF NOT EXISTS copilot_pending_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    intent VARCHAR(50) NOT NULL,
    command JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired')),
    source VARCHAR(20) DEFAULT 'portal' CHECK (source IN ('portal', 'whatsapp')),
    execution_result JSONB
);

CREATE INDEX IF NOT EXISTS idx_copilot_pending_merchant ON copilot_pending_actions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_copilot_pending_status ON copilot_pending_actions(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_copilot_pending_expires ON copilot_pending_actions(expires_at) WHERE status = 'pending';

-- ============================================================================
-- COPILOT HISTORY
-- ============================================================================
-- Logs all copilot interactions for analytics and debugging
CREATE TABLE IF NOT EXISTS copilot_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    source VARCHAR(20) NOT NULL CHECK (source IN ('portal', 'whatsapp')),
    input_type VARCHAR(10) NOT NULL CHECK (input_type IN ('text', 'voice')),
    input_text TEXT NOT NULL,
    intent VARCHAR(50),
    command JSONB,
    action_taken BOOLEAN DEFAULT FALSE,
    action_result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copilot_history_merchant ON copilot_history(merchant_id);
CREATE INDEX IF NOT EXISTS idx_copilot_history_created ON copilot_history(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_history_intent ON copilot_history(merchant_id, intent);

-- ============================================================================
-- MERCHANT COMMAND CHANNEL MAPPING
-- ============================================================================
-- Maps merchant phone numbers to enable WhatsApp command channel
CREATE TABLE IF NOT EXISTS merchant_command_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    UNIQUE(merchant_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_merchant_command_phone ON merchant_command_channels(phone_number) WHERE is_active = TRUE;

-- ============================================================================
-- EXPENSES TABLE (if not exists from previous migrations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    category VARCHAR(100),
    subcategory VARCHAR(100),
    description TEXT,
    expense_date DATE DEFAULT CURRENT_DATE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurring_day INTEGER,
    receipt_url TEXT,
    created_by VARCHAR(50) DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_merchant ON expenses(merchant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(merchant_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(merchant_id, category);

-- ============================================================================
-- COPILOT ENTITLEMENT
-- ============================================================================
-- Add COPILOT feature to entitlements
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'entitlements') THEN
        INSERT INTO entitlements (key, name, description, tier_required, depends_on, created_at)
        VALUES
            ('COPILOT', 'Merchant Copilot', 'Voice and text command interface for merchants', 'GROWTH', ARRAY['ORDERS'], NOW())
        ON CONFLICT (key) DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- CLEANUP FUNCTION
-- ============================================================================
-- Auto-expire old pending actions
CREATE OR REPLACE FUNCTION cleanup_expired_copilot_actions()
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE copilot_pending_actions 
    SET status = 'expired', updated_at = NOW()
    WHERE status = 'pending' AND expires_at < NOW();
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_copilot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_copilot_pending_updated ON copilot_pending_actions;
CREATE TRIGGER trg_copilot_pending_updated
    BEFORE UPDATE ON copilot_pending_actions
    FOR EACH ROW
    EXECUTE FUNCTION update_copilot_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE copilot_pending_actions IS 'Pending actions awaiting merchant confirmation via Copilot';
COMMENT ON TABLE copilot_history IS 'History of all Copilot interactions';
COMMENT ON TABLE merchant_command_channels IS 'WhatsApp numbers mapped for merchant command channel';
COMMENT ON TABLE expenses IS 'Merchant expense tracking for finance management';
