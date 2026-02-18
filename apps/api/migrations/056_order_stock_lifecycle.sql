-- Migration: 056_order_stock_lifecycle.sql
-- Description: Add stock_deducted flag to orders for automatic stock lifecycle management
-- When an order is placed → stock is frozen (deducted)
-- When an order is confirmed/paid → stock stays deducted (no change)
-- When an order is cancelled → stock is restored

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false;

-- Index for quick lookup of orders with active stock holds
CREATE INDEX IF NOT EXISTS idx_orders_stock_deducted 
ON orders(merchant_id, stock_deducted) 
WHERE stock_deducted = true;

COMMENT ON COLUMN orders.stock_deducted IS 'Tracks whether stock was deducted for this order. True = stock was frozen/deducted on order placement. Set false when cancelled and stock is restored.';
