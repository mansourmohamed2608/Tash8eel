-- Migration 093
-- Expand the BYO catalog so merchants can price every sellable standalone feature,
-- and add AI-only top-up packs based on the standalone AI pricebook.
--
-- Sources:
--   analysis/pricing/feature_catalog.csv
--   analysis/pricing/features_pricebook_by_country.csv
--   analysis/pricing/ai_pricebook_by_country.csv

-- -----------------------------------------------------------------------------
-- 1) Retire legacy low-granularity BYO items from the BYO surface
--    Keep them active for bundle compatibility, but stop exposing them as BYO picks.
-- -----------------------------------------------------------------------------
UPDATE add_ons
SET scope = CASE code
  WHEN 'INVENTORY_BASIC' THEN 'BUNDLE'
  WHEN 'FINANCE_BASIC' THEN 'BUNDLE'
  WHEN 'TEAM_UP_TO_3' THEN 'BUNDLE'
  WHEN 'POS_BASIC' THEN 'BUNDLE'
  WHEN 'POS_ADV' THEN 'BUNDLE'
  ELSE scope
END,
updated_at = NOW()
WHERE code IN ('INVENTORY_BASIC', 'FINANCE_BASIC', 'TEAM_UP_TO_3', 'POS_BASIC', 'POS_ADV');

UPDATE add_ons
SET scope = 'BOTH', updated_at = NOW()
WHERE code IN ('PROACTIVE_ALERTS', 'AUTONOMOUS_AGENT', 'MULTI_BRANCH_PER_1');

-- -----------------------------------------------------------------------------
-- 2) Add granular BYO feature catalog rows
-- -----------------------------------------------------------------------------
INSERT INTO add_ons (
  code,
  name,
  category,
  description,
  is_subscription,
  is_active,
  scope,
  addon_type,
  feature_enables,
  limit_floor_updates,
  limit_increments,
  metadata
)
VALUES
  ('INBOX_AI_CHANNEL', 'WhatsApp Inbox AI Assistant', 'OPS', 'AI assistant for incoming WhatsApp conversations', true, true, 'BYO', 'FEATURE', ARRAY['CONVERSATIONS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('WHATSAPP_BROADCASTS', 'WhatsApp Broadcast Campaigns', 'GROWTH', 'Outbound broadcast campaigns on WhatsApp', true, true, 'BYO', 'FEATURE', ARRAY['NOTIFICATIONS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('MAPS_LOCATION_FLOWS', 'Location and Directions Flows', 'GROWTH', 'Share location flows and map-assisted routing', true, true, 'BYO', 'FEATURE', ARRAY[]::text[], '{}'::jsonb, '{"mapsLookupsPerMonth":500}'::jsonb, '{}'::jsonb),
  ('PORTAL_ASSISTANT', 'Portal AI Assistant', 'OPS', 'AI copilot inside the merchant portal', true, true, 'BYO', 'FEATURE', ARRAY['COPILOT_CHAT']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('COPILOT_WORKFLOWS', 'Copilot Workflow Commands', 'OPS', 'Workflow shortcuts and command execution from Copilot', true, true, 'BYO', 'FEATURE', ARRAY['COPILOT_CHAT','AUTOMATIONS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('COPILOT_VOICE_NOTES', 'Copilot Voice Notes', 'OPS', 'Voice-note understanding and copilot voice actions', true, true, 'BYO', 'FEATURE', ARRAY['VOICE_NOTES','COPILOT_CHAT']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('COPILOT_VISION_HELPER', 'Copilot Vision Helper', 'OPS', 'Vision helper for portal AI tasks', true, true, 'BYO', 'FEATURE', ARRAY['COPILOT_CHAT']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('FINANCE_AUTOMATION', 'Finance Automation Suggestions', 'FINANCE', 'Finance suggestions and AI-assisted automation', true, true, 'BYO', 'FEATURE', ARRAY['REPORTS','AUTOMATIONS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('INVENTORY_INSIGHTS', 'Inventory AI Insights', 'INVENTORY', 'AI insights for stock, reorder and movement patterns', true, true, 'BYO', 'FEATURE', ARRAY['INVENTORY']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('PAYMENT_LINKS', 'Payment Links', 'FINANCE', 'Hosted payment links for checkout collection', true, true, 'BYO', 'FEATURE', ARRAY['PAYMENTS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('DAILY_REPORTS', 'Daily Reports', 'FINANCE', 'Daily operational and financial reports', true, true, 'BYO', 'FEATURE', ARRAY['REPORTS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('FOLLOWUP_AUTOMATIONS', 'Follow-up Automations', 'GROWTH', 'Follow-up and lifecycle automations', true, true, 'BYO', 'FEATURE', ARRAY['AUTOMATIONS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('ANOMALY_MONITOR', 'Anomaly Monitor', 'FINANCE', 'Detect unusual sales, payments and operations anomalies', true, true, 'BYO', 'FEATURE', ARRAY['REPORTS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb),
  ('MULTI_BRANCH', 'Multi-Branch Management', 'PLATFORM', 'Base package for managing multiple branches', true, true, 'BYO', 'CAPACITY', ARRAY[]::text[], '{}'::jsonb, '{"branches":1,"whatsappNumbers":1}'::jsonb, '{}'::jsonb),
  ('TEAM_SEAT_EXPANSION', 'Additional Team Seats', 'PLATFORM', 'Extra team seat capacity', true, true, 'BYO', 'CAPACITY', ARRAY['TEAM']::text[], '{}'::jsonb, '{"teamMembers":1}'::jsonb, '{}'::jsonb),
  ('API_WEBHOOKS', 'API and Webhooks', 'PLATFORM', 'Direct API access and outbound webhooks', true, true, 'BYO', 'FEATURE', ARRAY['API_ACCESS','WEBHOOKS']::text[], '{}'::jsonb, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_subscription = EXCLUDED.is_subscription,
  is_active = EXCLUDED.is_active,
  scope = EXCLUDED.scope,
  addon_type = EXCLUDED.addon_type,
  feature_enables = EXCLUDED.feature_enables,
  limit_floor_updates = EXCLUDED.limit_floor_updates,
  limit_increments = EXCLUDED.limit_increments,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 3) Add regional + cycle prices for the new BYO features from the country pricebook
-- -----------------------------------------------------------------------------
WITH price_seed AS (
  SELECT a.id AS addon_id, seed.region_code, seed.currency, seed.cycle_months,
         seed.price_cents, seed.discount_percent
  FROM add_ons a
  JOIN (
    VALUES
      ('INBOX_AI_CHANNEL','EG','EGP',1,80000,0),('INBOX_AI_CHANNEL','EG','EGP',3,240000,2),('INBOX_AI_CHANNEL','EG','EGP',6,470000,4),('INBOX_AI_CHANNEL','EG','EGP',12,910000,7),
      ('WHATSAPP_BROADCASTS','EG','EGP',1,65000,0),('WHATSAPP_BROADCASTS','EG','EGP',3,195000,2),('WHATSAPP_BROADCASTS','EG','EGP',6,385000,4),('WHATSAPP_BROADCASTS','EG','EGP',12,745000,7),
      ('MAPS_LOCATION_FLOWS','EG','EGP',1,60000,0),('MAPS_LOCATION_FLOWS','EG','EGP',3,175000,2),('MAPS_LOCATION_FLOWS','EG','EGP',6,340000,4),('MAPS_LOCATION_FLOWS','EG','EGP',12,665000,7),
      ('PORTAL_ASSISTANT','EG','EGP',1,90000,0),('PORTAL_ASSISTANT','EG','EGP',3,260000,2),('PORTAL_ASSISTANT','EG','EGP',6,515000,4),('PORTAL_ASSISTANT','EG','EGP',12,995000,7),
      ('COPILOT_WORKFLOWS','EG','EGP',1,95000,0),('COPILOT_WORKFLOWS','EG','EGP',3,285000,2),('COPILOT_WORKFLOWS','EG','EGP',6,555000,4),('COPILOT_WORKFLOWS','EG','EGP',12,1075000,7),
      ('COPILOT_VOICE_NOTES','EG','EGP',1,70000,0),('COPILOT_VOICE_NOTES','EG','EGP',3,205000,2),('COPILOT_VOICE_NOTES','EG','EGP',6,405000,4),('COPILOT_VOICE_NOTES','EG','EGP',12,785000,7),
      ('COPILOT_VISION_HELPER','EG','EGP',1,80000,0),('COPILOT_VISION_HELPER','EG','EGP',3,240000,2),('COPILOT_VISION_HELPER','EG','EGP',6,470000,4),('COPILOT_VISION_HELPER','EG','EGP',12,910000,7),
      ('FINANCE_AUTOMATION','EG','EGP',1,80000,0),('FINANCE_AUTOMATION','EG','EGP',3,230000,2),('FINANCE_AUTOMATION','EG','EGP',6,450000,4),('FINANCE_AUTOMATION','EG','EGP',12,870000,7),
      ('INVENTORY_INSIGHTS','EG','EGP',1,85000,0),('INVENTORY_INSIGHTS','EG','EGP',3,250000,2),('INVENTORY_INSIGHTS','EG','EGP',6,490000,4),('INVENTORY_INSIGHTS','EG','EGP',12,955000,7),
      ('AUTONOMOUS_AGENT','EG','EGP',1,165000,0),('AUTONOMOUS_AGENT','EG','EGP',3,490000,2),('AUTONOMOUS_AGENT','EG','EGP',6,960000,4),('AUTONOMOUS_AGENT','EG','EGP',12,1865000,7),
      ('PAYMENT_LINKS','EG','EGP',1,45000,0),('PAYMENT_LINKS','EG','EGP',3,130000,2),('PAYMENT_LINKS','EG','EGP',6,255000,4),('PAYMENT_LINKS','EG','EGP',12,495000,7),
      ('DAILY_REPORTS','EG','EGP',1,40000,0),('DAILY_REPORTS','EG','EGP',3,120000,2),('DAILY_REPORTS','EG','EGP',6,235000,4),('DAILY_REPORTS','EG','EGP',12,455000,7),
      ('FOLLOWUP_AUTOMATIONS','EG','EGP',1,50000,0),('FOLLOWUP_AUTOMATIONS','EG','EGP',3,155000,2),('FOLLOWUP_AUTOMATIONS','EG','EGP',6,300000,4),('FOLLOWUP_AUTOMATIONS','EG','EGP',12,580000,7),
      ('PROACTIVE_ALERTS','EG','EGP',1,65000,0),('PROACTIVE_ALERTS','EG','EGP',3,195000,2),('PROACTIVE_ALERTS','EG','EGP',6,385000,4),('PROACTIVE_ALERTS','EG','EGP',12,745000,7),
      ('ANOMALY_MONITOR','EG','EGP',1,65000,0),('ANOMALY_MONITOR','EG','EGP',3,185000,2),('ANOMALY_MONITOR','EG','EGP',6,365000,4),('ANOMALY_MONITOR','EG','EGP',12,705000,7),
      ('MULTI_BRANCH','EG','EGP',1,110000,0),('MULTI_BRANCH','EG','EGP',3,325000,2),('MULTI_BRANCH','EG','EGP',6,640000,4),('MULTI_BRANCH','EG','EGP',12,1245000,7),
      ('TEAM_SEAT_EXPANSION','EG','EGP',1,30000,0),('TEAM_SEAT_EXPANSION','EG','EGP',3,85000,2),('TEAM_SEAT_EXPANSION','EG','EGP',6,170000,4),('TEAM_SEAT_EXPANSION','EG','EGP',12,330000,7),
      ('API_WEBHOOKS','EG','EGP',1,35000,0),('API_WEBHOOKS','EG','EGP',3,110000,2),('API_WEBHOOKS','EG','EGP',6,215000,4),('API_WEBHOOKS','EG','EGP',12,415000,7),

      ('INBOX_AI_CHANNEL','SA','SAR',1,8500,0),('INBOX_AI_CHANNEL','SA','SAR',3,24500,5),('INBOX_AI_CHANNEL','SA','SAR',6,47000,10),('INBOX_AI_CHANNEL','SA','SAR',12,87500,16),
      ('WHATSAPP_BROADCASTS','SA','SAR',1,7000,0),('WHATSAPP_BROADCASTS','SA','SAR',3,20000,5),('WHATSAPP_BROADCASTS','SA','SAR',6,38500,10),('WHATSAPP_BROADCASTS','SA','SAR',12,71500,16),
      ('MAPS_LOCATION_FLOWS','SA','SAR',1,6500,0),('MAPS_LOCATION_FLOWS','SA','SAR',3,18000,5),('MAPS_LOCATION_FLOWS','SA','SAR',6,34000,10),('MAPS_LOCATION_FLOWS','SA','SAR',12,63500,16),
      ('PORTAL_ASSISTANT','SA','SAR',1,9500,0),('PORTAL_ASSISTANT','SA','SAR',3,27000,5),('PORTAL_ASSISTANT','SA','SAR',6,51000,10),('PORTAL_ASSISTANT','SA','SAR',12,95500,16),
      ('COPILOT_WORKFLOWS','SA','SAR',1,10000,0),('COPILOT_WORKFLOWS','SA','SAR',3,29000,5),('COPILOT_WORKFLOWS','SA','SAR',6,55500,10),('COPILOT_WORKFLOWS','SA','SAR',12,103000,16),
      ('COPILOT_VOICE_NOTES','SA','SAR',1,7500,0),('COPILOT_VOICE_NOTES','SA','SAR',3,21500,5),('COPILOT_VOICE_NOTES','SA','SAR',6,40500,10),('COPILOT_VOICE_NOTES','SA','SAR',12,75500,16),
      ('COPILOT_VISION_HELPER','SA','SAR',1,8500,0),('COPILOT_VISION_HELPER','SA','SAR',3,24500,5),('COPILOT_VISION_HELPER','SA','SAR',6,47000,10),('COPILOT_VISION_HELPER','SA','SAR',12,87500,16),
      ('FINANCE_AUTOMATION','SA','SAR',1,8500,0),('FINANCE_AUTOMATION','SA','SAR',3,23500,5),('FINANCE_AUTOMATION','SA','SAR',6,44500,10),('FINANCE_AUTOMATION','SA','SAR',12,83500,16),
      ('INVENTORY_INSIGHTS','SA','SAR',1,9000,0),('INVENTORY_INSIGHTS','SA','SAR',3,26000,5),('INVENTORY_INSIGHTS','SA','SAR',6,49000,10),('INVENTORY_INSIGHTS','SA','SAR',12,91500,16),
      ('AUTONOMOUS_AGENT','SA','SAR',1,17500,0),('AUTONOMOUS_AGENT','SA','SAR',3,50500,5),('AUTONOMOUS_AGENT','SA','SAR',6,95500,10),('AUTONOMOUS_AGENT','SA','SAR',12,178500,16),
      ('PAYMENT_LINKS','SA','SAR',1,4500,0),('PAYMENT_LINKS','SA','SAR',3,13500,5),('PAYMENT_LINKS','SA','SAR',6,25500,10),('PAYMENT_LINKS','SA','SAR',12,47500,16),
      ('DAILY_REPORTS','SA','SAR',1,4500,0),('DAILY_REPORTS','SA','SAR',3,12500,5),('DAILY_REPORTS','SA','SAR',6,23500,10),('DAILY_REPORTS','SA','SAR',12,43500,16),
      ('FOLLOWUP_AUTOMATIONS','SA','SAR',1,5500,0),('FOLLOWUP_AUTOMATIONS','SA','SAR',3,15500,5),('FOLLOWUP_AUTOMATIONS','SA','SAR',6,30000,10),('FOLLOWUP_AUTOMATIONS','SA','SAR',12,55500,16),
      ('PROACTIVE_ALERTS','SA','SAR',1,7000,0),('PROACTIVE_ALERTS','SA','SAR',3,20000,5),('PROACTIVE_ALERTS','SA','SAR',6,38500,10),('PROACTIVE_ALERTS','SA','SAR',12,71500,16),
      ('ANOMALY_MONITOR','SA','SAR',1,6500,0),('ANOMALY_MONITOR','SA','SAR',3,19000,5),('ANOMALY_MONITOR','SA','SAR',6,36000,10),('ANOMALY_MONITOR','SA','SAR',12,67500,16),
      ('MULTI_BRANCH','SA','SAR',1,12000,0),('MULTI_BRANCH','SA','SAR',3,33500,5),('MULTI_BRANCH','SA','SAR',6,64000,10),('MULTI_BRANCH','SA','SAR',12,119000,16),
      ('TEAM_SEAT_EXPANSION','SA','SAR',1,3000,0),('TEAM_SEAT_EXPANSION','SA','SAR',3,9000,5),('TEAM_SEAT_EXPANSION','SA','SAR',6,17000,10),('TEAM_SEAT_EXPANSION','SA','SAR',12,32000,16),
      ('API_WEBHOOKS','SA','SAR',1,4000,0),('API_WEBHOOKS','SA','SAR',3,11000,5),('API_WEBHOOKS','SA','SAR',6,21500,10),('API_WEBHOOKS','SA','SAR',12,39500,16),

      ('INBOX_AI_CHANNEL','AE','AED',1,9000,0),('INBOX_AI_CHANNEL','AE','AED',3,25500,6),('INBOX_AI_CHANNEL','AE','AED',6,48500,11),('INBOX_AI_CHANNEL','AE','AED',12,89000,18),
      ('WHATSAPP_BROADCASTS','AE','AED',1,7500,0),('WHATSAPP_BROADCASTS','AE','AED',3,21000,6),('WHATSAPP_BROADCASTS','AE','AED',6,39500,11),('WHATSAPP_BROADCASTS','AE','AED',12,73000,18),
      ('MAPS_LOCATION_FLOWS','AE','AED',1,6500,0),('MAPS_LOCATION_FLOWS','AE','AED',3,18500,6),('MAPS_LOCATION_FLOWS','AE','AED',6,35000,11),('MAPS_LOCATION_FLOWS','AE','AED',12,65000,18),
      ('PORTAL_ASSISTANT','AE','AED',1,10000,0),('PORTAL_ASSISTANT','AE','AED',3,28000,6),('PORTAL_ASSISTANT','AE','AED',6,52500,11),('PORTAL_ASSISTANT','AE','AED',12,97000,18),
      ('COPILOT_WORKFLOWS','AE','AED',1,10500,0),('COPILOT_WORKFLOWS','AE','AED',3,30000,6),('COPILOT_WORKFLOWS','AE','AED',6,57000,11),('COPILOT_WORKFLOWS','AE','AED',12,105000,18),
      ('COPILOT_VOICE_NOTES','AE','AED',1,8000,0),('COPILOT_VOICE_NOTES','AE','AED',3,22000,6),('COPILOT_VOICE_NOTES','AE','AED',6,41500,11),('COPILOT_VOICE_NOTES','AE','AED',12,77000,18),
      ('COPILOT_VISION_HELPER','AE','AED',1,9000,0),('COPILOT_VISION_HELPER','AE','AED',3,25500,6),('COPILOT_VISION_HELPER','AE','AED',6,48500,11),('COPILOT_VISION_HELPER','AE','AED',12,89000,18),
      ('FINANCE_AUTOMATION','AE','AED',1,8500,0),('FINANCE_AUTOMATION','AE','AED',3,24500,6),('FINANCE_AUTOMATION','AE','AED',6,46000,11),('FINANCE_AUTOMATION','AE','AED',12,85000,18),
      ('INVENTORY_INSIGHTS','AE','AED',1,9500,0),('INVENTORY_INSIGHTS','AE','AED',3,26500,6),('INVENTORY_INSIGHTS','AE','AED',6,50500,11),('INVENTORY_INSIGHTS','AE','AED',12,93000,18),
      ('AUTONOMOUS_AGENT','AE','AED',1,18500,0),('AUTONOMOUS_AGENT','AE','AED',3,52000,6),('AUTONOMOUS_AGENT','AE','AED',6,99000,11),('AUTONOMOUS_AGENT','AE','AED',12,182000,18),
      ('PAYMENT_LINKS','AE','AED',1,5000,0),('PAYMENT_LINKS','AE','AED',3,14000,6),('PAYMENT_LINKS','AE','AED',6,26500,11),('PAYMENT_LINKS','AE','AED',12,48500,18),
      ('DAILY_REPORTS','AE','AED',1,4500,0),('DAILY_REPORTS','AE','AED',3,13000,6),('DAILY_REPORTS','AE','AED',6,24000,11),('DAILY_REPORTS','AE','AED',12,44500,18),
      ('FOLLOWUP_AUTOMATIONS','AE','AED',1,6000,0),('FOLLOWUP_AUTOMATIONS','AE','AED',3,16000,6),('FOLLOWUP_AUTOMATIONS','AE','AED',6,31000,11),('FOLLOWUP_AUTOMATIONS','AE','AED',12,56500,18),
      ('PROACTIVE_ALERTS','AE','AED',1,7500,0),('PROACTIVE_ALERTS','AE','AED',3,21000,6),('PROACTIVE_ALERTS','AE','AED',6,39500,11),('PROACTIVE_ALERTS','AE','AED',12,73000,18),
      ('ANOMALY_MONITOR','AE','AED',1,7000,0),('ANOMALY_MONITOR','AE','AED',3,19500,6),('ANOMALY_MONITOR','AE','AED',6,37500,11),('ANOMALY_MONITOR','AE','AED',12,69000,18),
      ('MULTI_BRANCH','AE','AED',1,12500,0),('MULTI_BRANCH','AE','AED',3,35000,6),('MULTI_BRANCH','AE','AED',6,66000,11),('MULTI_BRANCH','AE','AED',12,121500,18),
      ('TEAM_SEAT_EXPANSION','AE','AED',1,3500,0),('TEAM_SEAT_EXPANSION','AE','AED',3,9500,6),('TEAM_SEAT_EXPANSION','AE','AED',6,17500,11),('TEAM_SEAT_EXPANSION','AE','AED',12,32500,18),
      ('API_WEBHOOKS','AE','AED',1,4000,0),('API_WEBHOOKS','AE','AED',3,11500,6),('API_WEBHOOKS','AE','AED',6,22000,11),('API_WEBHOOKS','AE','AED',12,40500,18),

      ('INBOX_AI_CHANNEL','OM','OMR',1,850,0),('INBOX_AI_CHANNEL','OM','OMR',3,2450,4),('INBOX_AI_CHANNEL','OM','OMR',6,4700,8),('INBOX_AI_CHANNEL','OM','OMR',12,8750,14),
      ('WHATSAPP_BROADCASTS','OM','OMR',1,700,0),('WHATSAPP_BROADCASTS','OM','OMR',3,2000,4),('WHATSAPP_BROADCASTS','OM','OMR',6,3850,8),('WHATSAPP_BROADCASTS','OM','OMR',12,7150,14),
      ('MAPS_LOCATION_FLOWS','OM','OMR',1,600,0),('MAPS_LOCATION_FLOWS','OM','OMR',3,1750,4),('MAPS_LOCATION_FLOWS','OM','OMR',6,3400,8),('MAPS_LOCATION_FLOWS','OM','OMR',12,6350,14),
      ('PORTAL_ASSISTANT','OM','OMR',1,900,0),('PORTAL_ASSISTANT','OM','OMR',3,2650,4),('PORTAL_ASSISTANT','OM','OMR',6,5100,8),('PORTAL_ASSISTANT','OM','OMR',12,9550,14),
      ('COPILOT_WORKFLOWS','OM','OMR',1,1000,0),('COPILOT_WORKFLOWS','OM','OMR',3,2900,4),('COPILOT_WORKFLOWS','OM','OMR',6,5550,8),('COPILOT_WORKFLOWS','OM','OMR',12,10350,14),
      ('COPILOT_VOICE_NOTES','OM','OMR',1,750,0),('COPILOT_VOICE_NOTES','OM','OMR',3,2100,4),('COPILOT_VOICE_NOTES','OM','OMR',6,4050,8),('COPILOT_VOICE_NOTES','OM','OMR',12,7550,14),
      ('COPILOT_VISION_HELPER','OM','OMR',1,850,0),('COPILOT_VISION_HELPER','OM','OMR',3,2450,4),('COPILOT_VISION_HELPER','OM','OMR',6,4700,8),('COPILOT_VISION_HELPER','OM','OMR',12,8750,14),
      ('FINANCE_AUTOMATION','OM','OMR',1,800,0),('FINANCE_AUTOMATION','OM','OMR',3,2350,4),('FINANCE_AUTOMATION','OM','OMR',6,4450,8),('FINANCE_AUTOMATION','OM','OMR',12,8350,14),
      ('INVENTORY_INSIGHTS','OM','OMR',1,900,0),('INVENTORY_INSIGHTS','OM','OMR',3,2550,4),('INVENTORY_INSIGHTS','OM','OMR',6,4900,8),('INVENTORY_INSIGHTS','OM','OMR',12,9150,14),
      ('AUTONOMOUS_AGENT','OM','OMR',1,1750,0),('AUTONOMOUS_AGENT','OM','OMR',3,5000,4),('AUTONOMOUS_AGENT','OM','OMR',6,9550,8),('AUTONOMOUS_AGENT','OM','OMR',12,17900,14),
      ('PAYMENT_LINKS','OM','OMR',1,450,0),('PAYMENT_LINKS','OM','OMR',3,1350,4),('PAYMENT_LINKS','OM','OMR',6,2550,8),('PAYMENT_LINKS','OM','OMR',12,4750,14),
      ('DAILY_REPORTS','OM','OMR',1,400,0),('DAILY_REPORTS','OM','OMR',3,1200,4),('DAILY_REPORTS','OM','OMR',6,2350,8),('DAILY_REPORTS','OM','OMR',12,4350,14),
      ('FOLLOWUP_AUTOMATIONS','OM','OMR',1,550,0),('FOLLOWUP_AUTOMATIONS','OM','OMR',3,1550,4),('FOLLOWUP_AUTOMATIONS','OM','OMR',6,3000,8),('FOLLOWUP_AUTOMATIONS','OM','OMR',12,5550,14),
      ('PROACTIVE_ALERTS','OM','OMR',1,700,0),('PROACTIVE_ALERTS','OM','OMR',3,2000,4),('PROACTIVE_ALERTS','OM','OMR',6,3850,8),('PROACTIVE_ALERTS','OM','OMR',12,7150,14),
      ('ANOMALY_MONITOR','OM','OMR',1,650,0),('ANOMALY_MONITOR','OM','OMR',3,1900,4),('ANOMALY_MONITOR','OM','OMR',6,3600,8),('ANOMALY_MONITOR','OM','OMR',12,6750,14),
      ('MULTI_BRANCH','OM','OMR',1,1150,0),('MULTI_BRANCH','OM','OMR',3,3350,4),('MULTI_BRANCH','OM','OMR',6,6400,8),('MULTI_BRANCH','OM','OMR',12,11900,14),
      ('TEAM_SEAT_EXPANSION','OM','OMR',1,300,0),('TEAM_SEAT_EXPANSION','OM','OMR',3,900,4),('TEAM_SEAT_EXPANSION','OM','OMR',6,1700,8),('TEAM_SEAT_EXPANSION','OM','OMR',12,3200,14),
      ('API_WEBHOOKS','OM','OMR',1,400,0),('API_WEBHOOKS','OM','OMR',3,1100,4),('API_WEBHOOKS','OM','OMR',6,2150,8),('API_WEBHOOKS','OM','OMR',12,3950,14),

      ('INBOX_AI_CHANNEL','KW','KWD',1,730,0),('INBOX_AI_CHANNEL','KW','KWD',3,2080,5),('INBOX_AI_CHANNEL','KW','KWD',6,3980,9),('INBOX_AI_CHANNEL','KW','KWD',12,7440,15),
      ('WHATSAPP_BROADCASTS','KW','KWD',1,600,0),('WHATSAPP_BROADCASTS','KW','KWD',3,1700,5),('WHATSAPP_BROADCASTS','KW','KWD',6,3260,9),('WHATSAPP_BROADCASTS','KW','KWD',12,6090,15),
      ('MAPS_LOCATION_FLOWS','KW','KWD',1,530,0),('MAPS_LOCATION_FLOWS','KW','KWD',3,1510,5),('MAPS_LOCATION_FLOWS','KW','KWD',6,2900,9),('MAPS_LOCATION_FLOWS','KW','KWD',12,5410,15),
      ('PORTAL_ASSISTANT','KW','KWD',1,800,0),('PORTAL_ASSISTANT','KW','KWD',3,2270,5),('PORTAL_ASSISTANT','KW','KWD',6,4340,9),('PORTAL_ASSISTANT','KW','KWD',12,8120,15),
      ('COPILOT_WORKFLOWS','KW','KWD',1,860,0),('COPILOT_WORKFLOWS','KW','KWD',3,2460,5),('COPILOT_WORKFLOWS','KW','KWD',6,4710,9),('COPILOT_WORKFLOWS','KW','KWD',12,8790,15),
      ('COPILOT_VOICE_NOTES','KW','KWD',1,630,0),('COPILOT_VOICE_NOTES','KW','KWD',3,1800,5),('COPILOT_VOICE_NOTES','KW','KWD',6,3440,9),('COPILOT_VOICE_NOTES','KW','KWD',12,6430,15),
      ('COPILOT_VISION_HELPER','KW','KWD',1,730,0),('COPILOT_VISION_HELPER','KW','KWD',3,2080,5),('COPILOT_VISION_HELPER','KW','KWD',6,3980,9),('COPILOT_VISION_HELPER','KW','KWD',12,7440,15),
      ('FINANCE_AUTOMATION','KW','KWD',1,700,0),('FINANCE_AUTOMATION','KW','KWD',3,1980,5),('FINANCE_AUTOMATION','KW','KWD',6,3800,9),('FINANCE_AUTOMATION','KW','KWD',12,7100,15),
      ('INVENTORY_INSIGHTS','KW','KWD',1,760,0),('INVENTORY_INSIGHTS','KW','KWD',3,2170,5),('INVENTORY_INSIGHTS','KW','KWD',6,4160,9),('INVENTORY_INSIGHTS','KW','KWD',12,7780,15),
      ('AUTONOMOUS_AGENT','KW','KWD',1,1490,0),('AUTONOMOUS_AGENT','KW','KWD',3,4250,5),('AUTONOMOUS_AGENT','KW','KWD',6,8150,9),('AUTONOMOUS_AGENT','KW','KWD',12,15220,15),
      ('PAYMENT_LINKS','KW','KWD',1,400,0),('PAYMENT_LINKS','KW','KWD',3,1130,5),('PAYMENT_LINKS','KW','KWD',6,2170,9),('PAYMENT_LINKS','KW','KWD',12,4060,15),
      ('DAILY_REPORTS','KW','KWD',1,360,0),('DAILY_REPORTS','KW','KWD',3,1040,5),('DAILY_REPORTS','KW','KWD',6,1990,9),('DAILY_REPORTS','KW','KWD',12,3720,15),
      ('FOLLOWUP_AUTOMATIONS','KW','KWD',1,460,0),('FOLLOWUP_AUTOMATIONS','KW','KWD',3,1320,5),('FOLLOWUP_AUTOMATIONS','KW','KWD',6,2530,9),('FOLLOWUP_AUTOMATIONS','KW','KWD',12,4730,15),
      ('PROACTIVE_ALERTS','KW','KWD',1,600,0),('PROACTIVE_ALERTS','KW','KWD',3,1700,5),('PROACTIVE_ALERTS','KW','KWD',6,3260,9),('PROACTIVE_ALERTS','KW','KWD',12,6090,15),
      ('ANOMALY_MONITOR','KW','KWD',1,560,0),('ANOMALY_MONITOR','KW','KWD',3,1610,5),('ANOMALY_MONITOR','KW','KWD',6,3080,9),('ANOMALY_MONITOR','KW','KWD',12,5750,15),
      ('MULTI_BRANCH','KW','KWD',1,990,0),('MULTI_BRANCH','KW','KWD',3,2830,5),('MULTI_BRANCH','KW','KWD',6,5430,9),('MULTI_BRANCH','KW','KWD',12,10150,15),
      ('TEAM_SEAT_EXPANSION','KW','KWD',1,270,0),('TEAM_SEAT_EXPANSION','KW','KWD',3,760,5),('TEAM_SEAT_EXPANSION','KW','KWD',6,1450,9),('TEAM_SEAT_EXPANSION','KW','KWD',12,2710,15),
      ('API_WEBHOOKS','KW','KWD',1,330,0),('API_WEBHOOKS','KW','KWD',3,940,5),('API_WEBHOOKS','KW','KWD',6,1810,9),('API_WEBHOOKS','KW','KWD',12,3380,15)
  ) AS seed(code, region_code, currency, cycle_months, price_cents, discount_percent)
    ON a.code = seed.code
)
INSERT INTO add_on_prices (
  addon_id,
  region_code,
  currency,
  cycle_months,
  base_price_cents,
  discount_percent,
  total_price_cents,
  effective_monthly_cents,
  vat_included
)
SELECT
  addon_id,
  region_code,
  currency,
  cycle_months,
  ROUND(price_cents::numeric / cycle_months)::integer,
  discount_percent,
  price_cents,
  ROUND(price_cents::numeric / cycle_months)::integer,
  true
FROM price_seed
ON CONFLICT (addon_id, region_code, cycle_months) DO UPDATE
SET
  currency = EXCLUDED.currency,
  base_price_cents = EXCLUDED.base_price_cents,
  discount_percent = EXCLUDED.discount_percent,
  total_price_cents = EXCLUDED.total_price_cents,
  effective_monthly_cents = EXCLUDED.effective_monthly_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 4) Add AI-only monthly top-up packs from the AI pricebook
-- -----------------------------------------------------------------------------
INSERT INTO usage_packs (
  code,
  name,
  metric_key,
  tier_code,
  included_units,
  included_ai_calls_per_day,
  included_token_budget_daily,
  limit_deltas,
  metadata,
  is_active
)
VALUES
  ('INAPP_AI_TOPUP_S', 'In-app AI Top-up Small', 'IN_APP_AI_ACTIONS', 'S', 5000, NULL, NULL, '{}'::jsonb, '{}'::jsonb, true),
  ('INAPP_AI_TOPUP_M', 'In-app AI Top-up Medium', 'IN_APP_AI_ACTIONS', 'M', 20000, NULL, NULL, '{}'::jsonb, '{}'::jsonb, true),
  ('INAPP_AI_TOPUP_L', 'In-app AI Top-up Large', 'IN_APP_AI_ACTIONS', 'L', 60000, NULL, NULL, '{}'::jsonb, '{}'::jsonb, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  metric_key = EXCLUDED.metric_key,
  tier_code = EXCLUDED.tier_code,
  included_units = EXCLUDED.included_units,
  included_ai_calls_per_day = EXCLUDED.included_ai_calls_per_day,
  included_token_budget_daily = EXCLUDED.included_token_budget_daily,
  limit_deltas = EXCLUDED.limit_deltas,
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

WITH ai_pack_seed AS (
  SELECT up.id AS usage_pack_id, seed.region_code, seed.currency, seed.price_cents
  FROM usage_packs up
  JOIN (
    VALUES
      ('INAPP_AI_TOPUP_S','EG','EGP',95000),('INAPP_AI_TOPUP_M','EG','EGP',355000),('INAPP_AI_TOPUP_L','EG','EGP',930000),
      ('INAPP_AI_TOPUP_S','SA','SAR',10000),('INAPP_AI_TOPUP_M','SA','SAR',37500),('INAPP_AI_TOPUP_L','SA','SAR',98500),
      ('INAPP_AI_TOPUP_S','AE','AED',10500),('INAPP_AI_TOPUP_M','AE','AED',39000),('INAPP_AI_TOPUP_L','AE','AED',103000),
      ('INAPP_AI_TOPUP_S','OM','OMR',950),('INAPP_AI_TOPUP_M','OM','OMR',3650),('INAPP_AI_TOPUP_L','OM','OMR',9600),
      ('INAPP_AI_TOPUP_S','KW','KWD',830),('INAPP_AI_TOPUP_M','KW','KWD',3150),('INAPP_AI_TOPUP_L','KW','KWD',8290)
  ) AS seed(code, region_code, currency, price_cents)
    ON up.code = seed.code
)
INSERT INTO usage_pack_prices (
  usage_pack_id,
  region_code,
  currency,
  price_cents,
  vat_included
)
SELECT usage_pack_id, region_code, currency, price_cents, true
FROM ai_pack_seed
ON CONFLICT (usage_pack_id, region_code) DO UPDATE
SET
  currency = EXCLUDED.currency,
  price_cents = EXCLUDED.price_cents,
  vat_included = EXCLUDED.vat_included,
  updated_at = NOW();