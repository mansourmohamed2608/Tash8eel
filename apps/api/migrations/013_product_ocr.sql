-- Migration: Product OCR Confirmations
-- Description: Table to track pending product OCR confirmations for customer response

-- Table to store pending product OCR confirmations
CREATE TABLE IF NOT EXISTS product_ocr_confirmations (
    id VARCHAR(50) PRIMARY KEY,
    merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
    customer_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(100),
    ocr_result JSONB NOT NULL,
    catalog_matches JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED')),
    selected_item_id UUID REFERENCES catalog_items(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_product_ocr_confirmations_customer 
    ON product_ocr_confirmations(merchant_id, customer_id, status);

CREATE INDEX IF NOT EXISTS idx_product_ocr_confirmations_expires 
    ON product_ocr_confirmations(expires_at) 
    WHERE status = 'PENDING';

-- Log table for product OCR analytics
CREATE TABLE IF NOT EXISTS product_ocr_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id),
    customer_id VARCHAR(255),
    conversation_id VARCHAR(100),
    image_content_type VARCHAR(100),
    ocr_success BOOLEAN NOT NULL,
    product_detected JSONB,
    catalog_matches_count INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_ocr_logs_merchant 
    ON product_ocr_logs(merchant_id, created_at DESC);

-- Function to auto-expire old confirmations
CREATE OR REPLACE FUNCTION expire_old_product_ocr_confirmations()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE product_ocr_confirmations 
    SET status = 'EXPIRED'
    WHERE status = 'PENDING' 
      AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON TABLE product_ocr_confirmations IS 'Stores pending product OCR confirmations awaiting customer response';
COMMENT ON TABLE product_ocr_logs IS 'Analytics log for product image OCR processing';
