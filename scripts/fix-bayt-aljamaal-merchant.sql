-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: Create 'bayt-aljamaal' as a separate merchant and move
--      demo@baytaljamaal.com out of 'demo-merchant'.
--
-- Run this ONCE against your Neon DB, then re-run the seed:
--   npx ts-node -r tsconfig-paths/register src/database/seeds/demo-merchant.seed.ts
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Create the بيت الجمال merchant with its own fixed ID
INSERT INTO merchants (
  id, name, category, plan, is_active,
  currency, language, country, city, timezone,
  enabled_features, enabled_agents,
  config, branding, negotiation_rules, delivery_rules, settings
)
VALUES (
  'bayt-aljamaal',
  'بيت الجمال للمنتجات المنزلية',
  'GENERIC', 'PRO', true,
  'EGP', 'ar', 'Egypt', 'القاهرة', 'Africa/Cairo',
  ARRAY['CONVERSATIONS','ORDERS','CATALOG','VOICE_NOTES','REPORTS','NOTIFICATIONS','INVENTORY','API_ACCESS','PAYMENTS','VISION_OCR','KPI_DASHBOARD','WEBHOOKS','TEAM','AUDIT_LOGS'],
  ARRAY['OPS_AGENT','INVENTORY_AGENT','FINANCE_AGENT'],
  '{"brandName":"بيت الجمال للمنتجات المنزلية","tone":"friendly","currency":"EGP","language":"ar-EG","locale":"ar-EG","enableNegotiation":false}',
  '{}',
  '{}',
  '{"defaultFee":50,"freeDeliveryThreshold":1000}',
  '{"demo":true,"demoVersion":"1.0"}'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Move demo@baytaljamaal.com staff account to the new merchant
UPDATE merchant_staff
SET merchant_id = 'bayt-aljamaal'
WHERE email = 'demo@baytaljamaal.com';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- After running this SQL, re-run the seed to populate منزلية products/orders:
--   cd apps/api
--   npx ts-node -r tsconfig-paths/register src/database/seeds/demo-merchant.seed.ts
--   npx ts-node -r tsconfig-paths/register src/database/seeds/create-demo-staff.ts
-- ─────────────────────────────────────────────────────────────────────────────
