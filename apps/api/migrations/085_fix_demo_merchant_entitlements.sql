-- Fix demo merchant missing entitlements
-- seed_inventory.sql was already applied so ON CONFLICT never re-ran.
-- This migration forcibly updates the demo-merchant row with the full feature+agent set.

UPDATE merchants
SET
  enabled_features = ARRAY[
    'CONVERSATIONS','ORDERS','CATALOG','VOICE_NOTES','REPORTS',
    'NOTIFICATIONS','INVENTORY','API_ACCESS','PAYMENTS','VISION_OCR',
    'KPI_DASHBOARD','WEBHOOKS','TEAM','AUDIT_LOGS'
  ],
  enabled_agents = ARRAY['OPS_AGENT','INVENTORY_AGENT','FINANCE_AGENT']
WHERE id = 'demo-merchant';
