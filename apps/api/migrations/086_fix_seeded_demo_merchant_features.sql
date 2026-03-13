-- Migration 086: Fix features for the seeded demo merchant (babc5b22-...)
-- The demo-merchant.seed.ts creates a merchant with a random UUID and no features set.
-- create-demo-staff.ts hardcodes that UUID for the demo@baytaljamaal.com staff account.
-- This migration grants PRO-tier features to that merchant and ensures demo@baytaljamaal.com
-- can log in via the demo-merchant account as well.

-- Fix features on the seeded demo merchant
UPDATE merchants SET
  plan = 'PRO',
  enabled_features = ARRAY['CONVERSATIONS','ORDERS','CATALOG','VOICE_NOTES','REPORTS',
    'NOTIFICATIONS','INVENTORY','API_ACCESS','PAYMENTS','VISION_OCR',
    'KPI_DASHBOARD','WEBHOOKS','TEAM','AUDIT_LOGS'],
  enabled_agents = ARRAY['OPS_AGENT','INVENTORY_AGENT','FINANCE_AGENT'],
  updated_at = NOW()
WHERE id = 'babc5b22-5401-46dc-b090-2295f0e1b17d';

-- Ensure demo@baytaljamaal.com also exists on demo-merchant so login with
-- merchantId = 'demo-merchant' works (the login page placeholder suggests demo-merchant)
INSERT INTO merchant_staff (id, merchant_id, email, name, role, password_hash, status, permissions, must_change_password)
SELECT
  gen_random_uuid(),
  'demo-merchant',
  email,
  name,
  role,
  password_hash,
  'ACTIVE',
  '{}',
  false
FROM merchant_staff
WHERE email = 'demo@baytaljamaal.com' AND merchant_id = 'babc5b22-5401-46dc-b090-2295f0e1b17d'
ON CONFLICT (merchant_id, email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  status = 'ACTIVE',
  must_change_password = false;
