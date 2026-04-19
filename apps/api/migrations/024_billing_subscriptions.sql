-- Billing & subscription tables (provider-agnostic)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE invoice_status AS ENUM ('OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS billing_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  price_cents INTEGER,
  currency VARCHAR(10) DEFAULT 'EGP',
  billing_period VARCHAR(20) DEFAULT 'monthly',
  description TEXT,
  features JSONB NOT NULL DEFAULT '[]',
  agents JSONB NOT NULL DEFAULT '[]',
  limits JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS merchant_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES billing_plans(id) ON DELETE RESTRICT,
  status subscription_status NOT NULL DEFAULT 'PENDING',
  provider VARCHAR(50) DEFAULT 'manual',
  provider_subscription_id VARCHAR(255),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES merchant_subscriptions(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'EGP',
  status invoice_status NOT NULL DEFAULT 'OPEN',
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  provider_invoice_id VARCHAR(255),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_merchant ON merchant_subscriptions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_merchant ON billing_invoices(merchant_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_billing_plans_updated_at BEFORE UPDATE ON billing_plans
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_merchant_subscriptions_updated_at BEFORE UPDATE ON merchant_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

INSERT INTO billing_plans (code, name, price_cents, currency, billing_period, description, features, agents, limits)
VALUES
  ('STARTER', 'Starter', 44900, 'EGP', 'monthly', 'Core operations + AI assistant — ~33 conversations/day', '["CONVERSATIONS","ORDERS","CATALOG","VOICE_NOTES","REPORTS","NOTIFICATIONS"]'::jsonb, '["OPS_AGENT"]'::jsonb, '{"messagesPerMonth":10000,"whatsappNumbers":1,"teamMembers":1,"tokenBudgetDaily":150000,"aiCallsPerDay":300}'::jsonb),
  ('GROWTH', 'Growth', 79900, 'EGP', 'monthly', 'Operations + Inventory AI — ~50 conversations/day', '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","VOICE_NOTES","REPORTS","NOTIFICATIONS","API_ACCESS"]'::jsonb, '["OPS_AGENT","INVENTORY_AGENT"]'::jsonb, '{"messagesPerMonth":15000,"whatsappNumbers":2,"teamMembers":2,"tokenBudgetDaily":300000,"aiCallsPerDay":500}'::jsonb),
  ('PRO', 'Pro', 149900, 'EGP', 'monthly', 'Full suite + Finance AI — ~167 conversations/day', '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","PAYMENTS","VISION_OCR","VOICE_NOTES","REPORTS","WEBHOOKS","TEAM","NOTIFICATIONS","AUDIT_LOGS","KPI_DASHBOARD","API_ACCESS"]'::jsonb, '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb, '{"messagesPerMonth":50000,"whatsappNumbers":3,"teamMembers":3,"tokenBudgetDaily":800000,"aiCallsPerDay":1500}'::jsonb),
  ('ENTERPRISE', 'Enterprise', 299900, 'EGP', 'monthly', '3 AI agents + unlimited conversations', '["CONVERSATIONS","ORDERS","CATALOG","INVENTORY","PAYMENTS","VISION_OCR","VOICE_NOTES","REPORTS","WEBHOOKS","TEAM","NOTIFICATIONS","AUDIT_LOGS","KPI_DASHBOARD","API_ACCESS"]'::jsonb, '["OPS_AGENT","INVENTORY_AGENT","FINANCE_AGENT"]'::jsonb, '{"messagesPerMonth":-1,"whatsappNumbers":-1,"teamMembers":10,"tokenBudgetDaily":-1,"aiCallsPerDay":-1}'::jsonb)
ON CONFLICT (code) DO NOTHING;
