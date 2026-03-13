-- Migration 092
-- 1) Sync billing_plans prices with plan_prices (migrations 089–091 updated plan_prices
--    but left the legacy billing_plans table stale).
-- 2) Add BASIC plan row to billing_plans (added in plan_prices by migration 089, missing here).
-- 3) Correct billing_plans limits JSONB for STARTER, BASIC, and GROWTH to match
--    the values fixed in migrations 090 (limits) and 091 (voice minutes).
-- 4) Add usage_pack_prices for OM (OMR) and KW (KWD) regions.
--    Migration 088 added add_on_prices for OM/KW but omitted usage_pack_prices,
--    leaving AI-capacity, voice-minutes, proof-check and template top-ups unpriced for those regions.
--
-- Prices reference: analysis/pricing/pricebook_by_country.csv
-- EG plan prices (cents): STARTER=99900 BASIC=220000 GROWTH=480000 PRO=1000000 ENTERPRISE=2150000
-- OM/KW usage-pack prices scaled from SA prices at 0.100x (OM) and 0.187x (KW) ratios
--   (same ratios used in migration 088 for add_on_prices)

-- -----------------------------------------------------------------------------
-- 1) Update existing billing_plans prices to match current plan_prices
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN

    -- STARTER was already 99900 from migration 071 — leave price alone, just fix limits
    UPDATE billing_plans
    SET
      price_cents = 99900,
      description = 'للتجار الجدد — وكيل عمليات ذكي + ~25 محادثة يومياً',
      features = '["CONVERSATIONS","ORDERS","CATALOG","PAYMENTS","REPORTS","NOTIFICATIONS","WEBHOOKS","VOICE_NOTES","COPILOT_CHAT"]'::jsonb,
      agents   = '["OPS_AGENT"]'::jsonb,
      limits   = '{"messagesPerMonth":5000,"whatsappNumbers":1,"teamMembers":1,"aiCallsPerDay":100,"tokenBudgetDaily":50000,"paidTemplatesPerMonth":5,"paymentProofScansPerMonth":25,"voiceMinutesPerMonth":20}'::jsonb,
      updated_at = NOW()
    WHERE code = 'STARTER';

    -- GROWTH: 189900 → 480000
    UPDATE billing_plans
    SET
      price_cents = 480000,
      description = 'للتجار المتوسعين — كل الوكلاء + فريق + ولاء + ~125 محادثة يومياً',
      features = '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","PAYMENTS","WEBHOOKS","API_ACCESS","COPILOT_CHAT","TEAM","LOYALTY","AUTOMATIONS","VOICE_NOTES"]'::jsonb,
      agents   = '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
      limits   = '{"messagesPerMonth":30000,"whatsappNumbers":2,"teamMembers":2,"aiCallsPerDay":500,"tokenBudgetDaily":400000,"paidTemplatesPerMonth":30,"paymentProofScansPerMonth":150,"voiceMinutesPerMonth":60}'::jsonb,
      updated_at = NOW()
    WHERE code = 'GROWTH';

    -- PRO: 329900 → 1000000
    UPDATE billing_plans
    SET
      price_cents = 1000000,
      description = 'للتجار المحترفين — +لوحة KPI + سجل تدقيق + توقعات + ~625 محادثة يومياً',
      features = '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","VOICE_NOTES","PAYMENTS","COPILOT_CHAT","TEAM","API_ACCESS","WEBHOOKS","KPI_DASHBOARD","AUDIT_LOGS","LOYALTY","AUTOMATIONS","FORECASTING"]'::jsonb,
      agents   = '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
      limits   = '{"messagesPerMonth":100000,"whatsappNumbers":3,"teamMembers":5,"aiCallsPerDay":2500,"tokenBudgetDaily":1000000,"paidTemplatesPerMonth":50,"paymentProofScansPerMonth":400,"voiceMinutesPerMonth":120}'::jsonb,
      updated_at = NOW()
    WHERE code = 'PRO';

    -- ENTERPRISE: 599900 → 2150000
    UPDATE billing_plans
    SET
      price_cents = 2150000,
      description = 'للمؤسسات الكبيرة — كل الميزات + مكالمات صوتية + SLA + ~1250 محادثة يومياً',
      features = '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","PAYMENTS","VOICE_NOTES","REPORTS","WEBHOOKS","TEAM","NOTIFICATIONS","AUDIT_LOGS","KPI_DASHBOARD","API_ACCESS","COPILOT_CHAT","CUSTOM_INTEGRATIONS","SLA","LOYALTY","AUTOMATIONS","FORECASTING","VOICE_CALLING"]'::jsonb,
      agents   = '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
      limits   = '{"messagesPerMonth":250000,"whatsappNumbers":5,"teamMembers":10,"aiCallsPerDay":5000,"tokenBudgetDaily":1750000,"paidTemplatesPerMonth":100,"paymentProofScansPerMonth":1200,"voiceMinutesPerMonth":240}'::jsonb,
      updated_at = NOW()
    WHERE code = 'ENTERPRISE';

  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Add BASIC plan to billing_plans (missing after migration 089 added it to plan_prices)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_plans') THEN

    INSERT INTO billing_plans (
      code, name, price_cents, currency, billing_period, description, features, agents, limits, is_active
    ) VALUES (
      'BASIC',
      'Basic',
      220000,
      'EGP',
      'monthly',
      'للتجار الصاعدين — كل الوكلاء + مخزون + دفع + ~37 محادثة يومياً',
      '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","REPORTS","NOTIFICATIONS","PAYMENTS","WEBHOOKS","API_ACCESS","VOICE_NOTES","COPILOT_CHAT"]'::jsonb,
      '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb,
      '{"messagesPerMonth":15000,"whatsappNumbers":1,"teamMembers":1,"aiCallsPerDay":200,"tokenBudgetDaily":200000,"paidTemplatesPerMonth":15,"paymentProofScansPerMonth":50,"voiceMinutesPerMonth":30}'::jsonb,
      true
    )
    ON CONFLICT (code) DO UPDATE
    SET
      name        = EXCLUDED.name,
      price_cents = EXCLUDED.price_cents,
      currency    = EXCLUDED.currency,
      description = EXCLUDED.description,
      features    = EXCLUDED.features,
      agents      = EXCLUDED.agents,
      limits      = EXCLUDED.limits,
      is_active   = EXCLUDED.is_active,
      updated_at  = NOW();

  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3) Add usage_pack_prices for OM (OMR) and KW (KWD)
--    Prices scaled from SA base prices:
--      OM ratio: 0.100x  (10.5 OMR / 105 SAR — same ratio as migration 088 add-on prices)
--      KW ratio: 0.187x  (19.6 KWD / 105 SAR — same ratio as migration 088 add-on prices)
-- -----------------------------------------------------------------------------
WITH om_kw_seed AS (
  SELECT up.id AS usage_pack_id, p.region_code, p.currency, p.price_cents
  FROM usage_packs up
  JOIN (
    VALUES
      -- AI capacity packs — OM (OMR)
      ('AI_CAPACITY_S',    'OM', 'OMR',   590),
      ('AI_CAPACITY_M',    'OM', 'OMR',  1090),
      ('AI_CAPACITY_L',    'OM', 'OMR',  2190),
      ('AI_CAPACITY_XL',   'OM', 'OMR',  3490),
      -- AI capacity packs — KW (KWD)
      ('AI_CAPACITY_S',    'KW', 'KWD',  1100),
      ('AI_CAPACITY_M',    'KW', 'KWD',  2040),
      ('AI_CAPACITY_L',    'KW', 'KWD',  4100),
      ('AI_CAPACITY_XL',   'KW', 'KWD',  6530),

      -- Proof-check packs — OM (OMR)
      ('PROOF_CHECKS_S',   'OM', 'OMR',   390),
      ('PROOF_CHECKS_M',   'OM', 'OMR',   890),
      ('PROOF_CHECKS_L',   'OM', 'OMR',  2090),
      ('PROOF_CHECKS_XL',  'OM', 'OMR',  3290),
      -- Proof-check packs — KW (KWD)
      ('PROOF_CHECKS_S',   'KW', 'KWD',   730),
      ('PROOF_CHECKS_M',   'KW', 'KWD',  1660),
      ('PROOF_CHECKS_L',   'KW', 'KWD',  3910),
      ('PROOF_CHECKS_XL',  'KW', 'KWD',  6150),

      -- Voice-minute packs — OM (OMR)
      ('VOICE_MINUTES_S',  'OM', 'OMR',   250),
      ('VOICE_MINUTES_M',  'OM', 'OMR',   590),
      ('VOICE_MINUTES_L',  'OM', 'OMR',  1290),
      ('VOICE_MINUTES_XL', 'OM', 'OMR',  2790),
      -- Voice-minute packs — KW (KWD)
      ('VOICE_MINUTES_S',  'KW', 'KWD',   470),
      ('VOICE_MINUTES_M',  'KW', 'KWD',  1100),
      ('VOICE_MINUTES_L',  'KW', 'KWD',  2410),
      ('VOICE_MINUTES_XL', 'KW', 'KWD',  5220),

      -- Paid-template packs — OM (OMR)
      ('PAID_TEMPLATES_S', 'OM', 'OMR',   390),
      ('PAID_TEMPLATES_M', 'OM', 'OMR',   990),
      ('PAID_TEMPLATES_L', 'OM', 'OMR',  2990),
      -- Paid-template packs — KW (KWD)
      ('PAID_TEMPLATES_S', 'KW', 'KWD',   730),
      ('PAID_TEMPLATES_M', 'KW', 'KWD',  1850),
      ('PAID_TEMPLATES_L', 'KW', 'KWD',  5590)
  ) AS p(usage_pack_code, region_code, currency, price_cents)
    ON up.code = p.usage_pack_code
)
INSERT INTO usage_pack_prices (
  usage_pack_id,
  region_code,
  currency,
  price_cents,
  vat_included
)
SELECT usage_pack_id, region_code, currency, price_cents, false
FROM om_kw_seed
ON CONFLICT (usage_pack_id, region_code) DO UPDATE
  SET
    currency     = EXCLUDED.currency,
    price_cents  = EXCLUDED.price_cents,
    vat_included = EXCLUDED.vat_included,
    updated_at   = NOW();
