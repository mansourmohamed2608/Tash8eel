-- 058: Delivery auto-assign settings on merchants table
-- Adds columns for automatic delivery driver assignment

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS auto_assign_delivery BOOLEAN DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS delivery_assignment_mode VARCHAR(20) DEFAULT 'round_robin';
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS notify_customer_on_assign BOOLEAN DEFAULT true;

-- Add index on delivery_drivers for quick active-driver lookups
CREATE INDEX IF NOT EXISTS idx_delivery_drivers_active 
  ON delivery_drivers (merchant_id, status) WHERE status = 'ACTIVE';

-- Add index on orders for unassigned order lookups
CREATE INDEX IF NOT EXISTS idx_orders_unassigned 
  ON orders (merchant_id, created_at) 
  WHERE assigned_driver_id IS NULL AND status NOT IN ('DELIVERED', 'CANCELLED');
