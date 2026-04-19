-- Migration 011 - Payment Links and Payment Proof System
-- Supports payment link generation and proof-of-payment verification workflow

-- Payment link status enum
CREATE TYPE payment_link_status AS ENUM ('PENDING', 'VIEWED', 'PAID', 'EXPIRED', 'CANCELLED');

-- Payment proof status enum
CREATE TYPE payment_proof_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Payment method enum
CREATE TYPE payment_method_type AS ENUM ('COD', 'INSTAPAY', 'BANK_TRANSFER', 'VODAFONE_CASH', 'FAWRY', 'CARD', 'OTHER');

-- Payment links table
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Link details
  link_code VARCHAR(20) NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
  description TEXT,
  
  -- Status tracking
  status payment_link_status NOT NULL DEFAULT 'PENDING',
  viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Customer info
  customer_phone VARCHAR(50),
  customer_name VARCHAR(255),
  
  -- Payment method (if specified)
  allowed_methods payment_method_type[] DEFAULT '{INSTAPAY,BANK_TRANSFER,VODAFONE_CASH}',
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_merchant ON payment_links(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_order ON payment_links(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_code ON payment_links(link_code);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links(status) WHERE status IN ('PENDING', 'VIEWED');
CREATE INDEX IF NOT EXISTS idx_payment_links_expires ON payment_links(expires_at) WHERE status = 'PENDING';

-- Payment proofs table
CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  payment_link_id UUID REFERENCES payment_links(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
  
  -- Proof details
  proof_type VARCHAR(50) NOT NULL DEFAULT 'receipt_image', -- receipt_image, screenshot, reference_number
  image_url TEXT,
  image_base64 TEXT, -- For direct upload
  reference_number VARCHAR(100),
  
  -- OCR extracted data
  ocr_result JSONB,
  extracted_amount DECIMAL(10,2),
  extracted_reference VARCHAR(100),
  extracted_sender VARCHAR(255),
  extracted_date DATE,
  ocr_confidence DECIMAL(5,4),
  
  -- Verification status
  status payment_proof_status NOT NULL DEFAULT 'PENDING',
  verified_at TIMESTAMPTZ,
  verified_by VARCHAR(100), -- Staff/merchant who verified
  rejection_reason TEXT,
  
  -- Auto-verification
  auto_verified BOOLEAN DEFAULT false,
  auto_verification_score DECIMAL(5,4),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_proofs_merchant ON payment_proofs(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_link ON payment_proofs(payment_link_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_status ON payment_proofs(status) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_payment_proofs_ref ON payment_proofs(extracted_reference) WHERE extracted_reference IS NOT NULL;

-- Add payment_method and payment_status to orders
ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS payment_method payment_method_type DEFAULT 'COD',
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS payment_link_id UUID REFERENCES payment_links(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_proof_id UUID REFERENCES payment_proofs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);

-- Function to generate unique payment link code
CREATE OR REPLACE FUNCTION generate_payment_link_code()
RETURNS VARCHAR(20) AS $$
DECLARE
  code VARCHAR(20);
  exists_count INTEGER;
BEGIN
  LOOP
    -- Generate format: PAY-XXXXXX (6 alphanumeric chars)
    code := 'PAY-' || upper(substring(md5(random()::text) from 1 for 6));
    
    SELECT COUNT(*) INTO exists_count FROM payment_links WHERE link_code = code;
    EXIT WHEN exists_count = 0;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate link code
CREATE OR REPLACE FUNCTION set_payment_link_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.link_code IS NULL THEN
    NEW.link_code := generate_payment_link_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_link_code_trigger ON payment_links;
CREATE TRIGGER payment_link_code_trigger
  BEFORE INSERT ON payment_links
  FOR EACH ROW
  EXECUTE FUNCTION set_payment_link_code();

-- Update triggers
CREATE TRIGGER update_payment_links_updated_at BEFORE UPDATE ON payment_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_proofs_updated_at BEFORE UPDATE ON payment_proofs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
