-- 125_order_items_and_monthly_close_alignment.sql
-- Purpose:
-- 1) Restore order_items as the canonical order-line table used by runtime code.
-- 2) Backfill order_items from legacy orders.items JSONB without removing fallbacks.
-- 3) Document Batch 1 inventory movement guardrail: no stock_movements/inventory_movements consolidation here.

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  merchant_id VARCHAR(50) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  catalog_item_id UUID NULL REFERENCES catalog_items(id) ON DELETE SET NULL,
  name TEXT,
  product_name TEXT,
  sku TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS order_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS merchant_id VARCHAR(50);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS catalog_item_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS quantity NUMERIC(12,3) DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE order_items oi
SET merchant_id = o.merchant_id
FROM orders o
WHERE oi.order_id = o.id
  AND oi.merchant_id IS NULL;

UPDATE order_items
SET id = uuid_generate_v4()
WHERE id IS NULL;

UPDATE order_items
SET
  name = COALESCE(name, product_name),
  product_name = COALESCE(product_name, name),
  quantity = COALESCE(quantity, 1),
  unit_price = COALESCE(unit_price, 0),
  total_price = CASE
    WHEN COALESCE(total_price, 0) = 0 THEN COALESCE(quantity, 1) * COALESCE(unit_price, 0)
    ELSE total_price
  END,
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_merchant_id_fkey'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_merchant_id_fkey
      FOREIGN KEY (merchant_id) REFERENCES merchants(id) ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_catalog_item_id_fkey'
  ) THEN
    ALTER TABLE order_items
      ADD CONSTRAINT order_items_catalog_item_id_fkey
      FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_pkey'
  ) THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE id IS NULL) THEN
    ALTER TABLE order_items ALTER COLUMN id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE order_id IS NULL) THEN
    ALTER TABLE order_items ALTER COLUMN order_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE merchant_id IS NULL) THEN
    ALTER TABLE order_items ALTER COLUMN merchant_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE quantity IS NULL) THEN
    ALTER TABLE order_items ALTER COLUMN quantity SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE unit_price IS NULL) THEN
    ALTER TABLE order_items ALTER COLUMN unit_price SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE total_price IS NULL) THEN
    ALTER TABLE order_items ALTER COLUMN total_price SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM order_items WHERE metadata IS NULL) THEN
    ALTER TABLE order_items ALTER COLUMN metadata SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_merchant_created
  ON order_items(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_merchant_catalog
  ON order_items(merchant_id, catalog_item_id);

CREATE INDEX IF NOT EXISTS idx_order_items_merchant_sku
  ON order_items(merchant_id, sku);

CREATE OR REPLACE FUNCTION normalize_order_items_row()
RETURNS trigger AS $$
BEGIN
  IF NEW.merchant_id IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT merchant_id INTO NEW.merchant_id
    FROM orders
    WHERE id = NEW.order_id;
  END IF;

  NEW.name := NULLIF(BTRIM(COALESCE(NEW.name, NEW.product_name, '')), '');
  NEW.product_name := NULLIF(BTRIM(COALESCE(NEW.product_name, NEW.name, '')), '');
  NEW.quantity := COALESCE(NEW.quantity, 1);
  NEW.unit_price := COALESCE(NEW.unit_price, 0);

  IF COALESCE(NEW.total_price, 0) = 0 THEN
    NEW.total_price := NEW.quantity * NEW.unit_price;
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_order_items_row ON order_items;
CREATE TRIGGER trg_normalize_order_items_row
BEFORE INSERT OR UPDATE ON order_items
FOR EACH ROW
EXECUTE FUNCTION normalize_order_items_row();

WITH source_orders AS (
  SELECT
    o.id AS order_id,
    o.merchant_id,
    o.created_at,
    item.value AS item
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(o.items) = 'array' THEN o.items
      ELSE '[]'::jsonb
    END
  ) AS item(value)
  WHERE NOT EXISTS (
    SELECT 1 FROM order_items oi WHERE oi.order_id = o.id
  )
),
normalized AS (
  SELECT
    order_id,
    merchant_id,
    created_at,
    CASE
      WHEN COALESCE(item->>'catalogItemId', item->>'catalog_item_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN COALESCE(item->>'catalogItemId', item->>'catalog_item_id')::uuid
      ELSE NULL
    END AS catalog_item_id,
    NULLIF(COALESCE(item->>'name', item->>'productName', item->>'product_name', item->>'nameAr', item->>'sku'), '') AS item_name,
    NULLIF(item->>'sku', '') AS sku,
    CASE
      WHEN COALESCE(item->>'quantity', item->>'qty') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN COALESCE(item->>'quantity', item->>'qty')::numeric
      ELSE 1
    END AS quantity,
    CASE
      WHEN COALESCE(item->>'unitPrice', item->>'unit_price', item->>'price') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN COALESCE(item->>'unitPrice', item->>'unit_price', item->>'price')::numeric
      ELSE 0
    END AS unit_price,
    CASE
      WHEN COALESCE(item->>'lineTotal', item->>'totalPrice', item->>'total_price') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN COALESCE(item->>'lineTotal', item->>'totalPrice', item->>'total_price')::numeric
      ELSE NULL
    END AS explicit_total,
    NULLIF(item->>'notes', '') AS notes,
    item
  FROM source_orders
)
INSERT INTO order_items (
  order_id,
  merchant_id,
  catalog_item_id,
  name,
  product_name,
  sku,
  quantity,
  unit_price,
  total_price,
  notes,
  metadata,
  created_at,
  updated_at
)
SELECT
  order_id,
  merchant_id,
  catalog_item_id,
  item_name,
  item_name,
  sku,
  quantity,
  unit_price,
  COALESCE(explicit_total, quantity * unit_price),
  notes,
  jsonb_build_object('source', 'orders.items_backfill', 'raw', item),
  created_at,
  NOW()
FROM normalized
WHERE item_name IS NOT NULL
   OR sku IS NOT NULL
   OR quantity <> 1
   OR unit_price <> 0;

COMMENT ON TABLE order_items IS
  'Canonical order line table restored in migration 125. orders.items remains a legacy snapshot/fallback during Batch 1 stabilization.';
