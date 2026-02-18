-- =====================================================
-- Migration: 009_loyalty_and_promotions.sql
-- Description: Customer loyalty program and promotions engine
-- =====================================================

-- Customer Loyalty Tiers
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100) NOT NULL,
  min_points INTEGER NOT NULL DEFAULT 0,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  free_shipping BOOLEAN DEFAULT FALSE,
  priority_support BOOLEAN DEFAULT FALSE,
  exclusive_access BOOLEAN DEFAULT FALSE,
  multiplier DECIMAL(3,2) DEFAULT 1.0, -- Points earning multiplier
  color VARCHAR(7) DEFAULT '#6B7280', -- Hex color for UI
  icon VARCHAR(50) DEFAULT 'star',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(merchant_id, name)
);

-- Customer Points Ledger
CREATE TABLE IF NOT EXISTS customer_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  current_points INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  tier_id UUID REFERENCES loyalty_tiers(id),
  points_expiring_at TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(merchant_id, customer_id)
);

-- Points Transactions History
CREATE TABLE IF NOT EXISTS points_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL, -- EARN, REDEEM, EXPIRE, ADJUST, BONUS
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  source VARCHAR(100), -- ORDER, REFERRAL, BIRTHDAY, MANUAL, REVIEW, SIGNUP
  reference_id VARCHAR(255), -- Order ID, Referral ID, etc.
  description TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  staff_id UUID, -- For manual adjustments
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_points_transactions_customer ON points_transactions(merchant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_created ON points_transactions(created_at DESC);

-- Customer Referrals
CREATE TABLE IF NOT EXISTS customer_referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  referrer_customer_id UUID NOT NULL,
  referred_customer_id UUID NOT NULL,
  referral_code VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, COMPLETED, EXPIRED
  referrer_points INTEGER DEFAULT 0,
  referred_points INTEGER DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(merchant_id, referral_code)
);

-- Promotions / Discount Campaigns
CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  type VARCHAR(50) NOT NULL, -- PERCENTAGE, FIXED_AMOUNT, FREE_SHIPPING, BUY_X_GET_Y, POINTS_MULTIPLIER
  value DECIMAL(10,2) NOT NULL, -- Discount amount or percentage
  code VARCHAR(50), -- Promo code (optional)
  auto_apply BOOLEAN DEFAULT FALSE, -- Automatically apply if conditions met
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  max_discount_amount DECIMAL(10,2), -- Cap for percentage discounts
  usage_limit INTEGER, -- Total uses allowed
  usage_per_customer INTEGER DEFAULT 1, -- Uses per customer
  current_usage INTEGER DEFAULT 0,
  target_audience JSONB DEFAULT '{}', -- Segment targeting
  applicable_products JSONB DEFAULT '[]', -- Product/category restrictions
  excluded_products JSONB DEFAULT '[]',
  tier_restriction VARCHAR(50)[], -- Loyalty tier restrictions
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(merchant_id, is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(merchant_id, code) WHERE code IS NOT NULL;

-- Promotion Usage Tracking
CREATE TABLE IF NOT EXISTS promotion_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  merchant_id VARCHAR(255) NOT NULL,
  customer_id UUID NOT NULL,
  order_id UUID,
  discount_amount DECIMAL(10,2) NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotion_usage_customer ON promotion_usage(promotion_id, customer_id);

-- Gift Cards
CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  initial_balance DECIMAL(10,2) NOT NULL,
  current_balance DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EGP',
  purchaser_customer_id UUID,
  recipient_email VARCHAR(255),
  recipient_name VARCHAR(255),
  message TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(merchant_id, code)
);

-- Gift Card Transactions
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- PURCHASE, REDEEM, REFUND
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  order_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Customer Segments for Targeting
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(255) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'DYNAMIC', -- DYNAMIC (auto-calculated), STATIC (manual)
  conditions JSONB DEFAULT '{}', -- Rules for dynamic segments
  customer_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(merchant_id, name)
);

-- Static Segment Memberships
CREATE TABLE IF NOT EXISTS segment_memberships (
  segment_id UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (segment_id, customer_id)
);

-- Default Loyalty Tiers Function
CREATE OR REPLACE FUNCTION create_default_loyalty_tiers(p_merchant_id VARCHAR)
RETURNS VOID AS $$
BEGIN
  INSERT INTO loyalty_tiers (merchant_id, name, name_ar, min_points, discount_percentage, color, icon)
  VALUES
    (p_merchant_id, 'Bronze', 'برونزي', 0, 0, '#CD7F32', 'medal'),
    (p_merchant_id, 'Silver', 'فضي', 500, 5, '#C0C0C0', 'award'),
    (p_merchant_id, 'Gold', 'ذهبي', 2000, 10, '#FFD700', 'crown'),
    (p_merchant_id, 'Platinum', 'بلاتيني', 5000, 15, '#E5E4E2', 'gem')
  ON CONFLICT (merchant_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Calculate Customer Tier Function
CREATE OR REPLACE FUNCTION calculate_customer_tier(p_merchant_id VARCHAR, p_lifetime_points INTEGER)
RETURNS UUID AS $$
DECLARE
  v_tier_id UUID;
BEGIN
  SELECT id INTO v_tier_id
  FROM loyalty_tiers
  WHERE merchant_id = p_merchant_id
    AND min_points <= p_lifetime_points
  ORDER BY min_points DESC
  LIMIT 1;
  
  RETURN v_tier_id;
END;
$$ LANGUAGE plpgsql;

-- Add Points Function (with tier recalculation)
CREATE OR REPLACE FUNCTION add_customer_points(
  p_merchant_id VARCHAR,
  p_customer_id UUID,
  p_points INTEGER,
  p_type VARCHAR,
  p_source VARCHAR,
  p_reference_id VARCHAR DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_current_points INTEGER;
  v_lifetime_points INTEGER;
  v_new_tier_id UUID;
BEGIN
  -- Get or create customer points record
  INSERT INTO customer_points (merchant_id, customer_id, current_points, lifetime_points)
  VALUES (p_merchant_id, p_customer_id, 0, 0)
  ON CONFLICT (merchant_id, customer_id) DO NOTHING;
  
  -- Update points
  UPDATE customer_points
  SET 
    current_points = current_points + p_points,
    lifetime_points = CASE WHEN p_type = 'EARN' THEN lifetime_points + p_points ELSE lifetime_points END,
    last_activity_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE merchant_id = p_merchant_id AND customer_id = p_customer_id
  RETURNING current_points, lifetime_points INTO v_current_points, v_lifetime_points;
  
  -- Calculate new tier
  v_new_tier_id := calculate_customer_tier(p_merchant_id, v_lifetime_points);
  
  -- Update tier if changed
  UPDATE customer_points
  SET tier_id = v_new_tier_id
  WHERE merchant_id = p_merchant_id AND customer_id = p_customer_id;
  
  -- Record transaction
  INSERT INTO points_transactions (
    merchant_id, customer_id, type, points, balance_after,
    source, reference_id, description, expires_at
  ) VALUES (
    p_merchant_id, p_customer_id, p_type, p_points, v_current_points,
    p_source, p_reference_id, p_description, p_expires_at
  );
  
  RETURN v_current_points;
END;
$$ LANGUAGE plpgsql;

-- Generate Referral Code Function
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR AS $$
BEGIN
  RETURN UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
END;
$$ LANGUAGE plpgsql;

-- Expire Points Job (run daily)
CREATE OR REPLACE FUNCTION expire_points()
RETURNS INTEGER AS $$
DECLARE
  v_expired_count INTEGER := 0;
  v_record RECORD;
BEGIN
  FOR v_record IN
    SELECT id, merchant_id, customer_id, points
    FROM points_transactions
    WHERE type = 'EARN'
      AND expires_at IS NOT NULL
      AND expires_at < CURRENT_TIMESTAMP
      AND id NOT IN (
        SELECT reference_id::UUID FROM points_transactions WHERE type = 'EXPIRE' AND reference_id IS NOT NULL
      )
  LOOP
    PERFORM add_customer_points(
      v_record.merchant_id,
      v_record.customer_id,
      -v_record.points,
      'EXPIRE',
      'EXPIRATION',
      v_record.id::VARCHAR,
      'Points expired'
    );
    v_expired_count := v_expired_count + 1;
  END LOOP;
  
  RETURN v_expired_count;
END;
$$ LANGUAGE plpgsql;

-- Analytics Views
CREATE OR REPLACE VIEW loyalty_analytics AS
SELECT 
  cp.merchant_id,
  COUNT(*) as total_members,
  COUNT(*) FILTER (WHERE cp.current_points > 0) as active_members,
  SUM(cp.current_points) as total_outstanding_points,
  SUM(cp.lifetime_points) as total_earned_points,
  AVG(cp.lifetime_points) as avg_lifetime_points,
  lt.name as tier_name,
  COUNT(*) FILTER (WHERE lt.id IS NOT NULL) as tier_count
FROM customer_points cp
LEFT JOIN loyalty_tiers lt ON cp.tier_id = lt.id
GROUP BY cp.merchant_id, lt.name, lt.id;

CREATE OR REPLACE VIEW promotion_performance AS
SELECT 
  p.id,
  p.merchant_id,
  p.name,
  p.type,
  p.code,
  p.start_date,
  p.end_date,
  p.usage_limit,
  p.current_usage,
  COUNT(pu.id) as actual_usage,
  COALESCE(SUM(pu.discount_amount), 0) as total_discount_given,
  AVG(pu.discount_amount) as avg_discount
FROM promotions p
LEFT JOIN promotion_usage pu ON p.id = pu.promotion_id
GROUP BY p.id;

COMMENT ON TABLE loyalty_tiers IS 'Loyalty program tiers with benefits';
COMMENT ON TABLE customer_points IS 'Customer points balance and tier';
COMMENT ON TABLE points_transactions IS 'Points earning and redemption history';
COMMENT ON TABLE promotions IS 'Discount campaigns and promo codes';
COMMENT ON TABLE gift_cards IS 'Store gift cards with balances';
COMMENT ON TABLE customer_segments IS 'Customer segments for targeted marketing';
