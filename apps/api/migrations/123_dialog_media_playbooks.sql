-- 123_dialog_media_playbooks.sql
-- Merchant-generic dialog data: product media and sales playbooks.

CREATE TABLE IF NOT EXISTS product_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  variant_sku VARCHAR(100),
  url TEXT NOT NULL,
  caption_ar TEXT,
  caption_en TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  channel_flags JSONB NOT NULL DEFAULT '{"whatsapp": true, "messenger": true, "instagram": true}'::jsonb,
  send_on VARCHAR(30) NOT NULL DEFAULT 'on_request',
  fallback_text TEXT,
  hash VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_product_media_send_on
    CHECK (send_on IN ('variant_ask', 'confirm', 'on_request', 'always'))
);

CREATE INDEX IF NOT EXISTS idx_product_media_catalog_item
  ON product_media(catalog_item_id, display_order);

CREATE INDEX IF NOT EXISTS idx_product_media_send_on
  ON product_media(send_on);

CREATE TABLE IF NOT EXISTS merchant_sales_playbooks (
  merchant_id VARCHAR(50) PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  slot_graph JSONB NOT NULL DEFAULT '[]'::jsonb,
  constraint_dims JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_question_templates JSONB NOT NULL DEFAULT '{}'::jsonb,
  intent_examples JSONB NOT NULL DEFAULT '{}'::jsonb,
  slot_extractors JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_sales_playbooks_version
  ON merchant_sales_playbooks(version);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_product_media_updated_at'
  ) THEN
    CREATE TRIGGER update_product_media_updated_at
      BEFORE UPDATE ON product_media
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_merchant_sales_playbooks_updated_at'
  ) THEN
    CREATE TRIGGER update_merchant_sales_playbooks_updated_at
      BEFORE UPDATE ON merchant_sales_playbooks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
