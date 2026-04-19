-- 068_catalog_items_active_compat.sql
-- Purpose: Keep legacy `is_active` and current `is_available` flags in sync on catalog_items
-- so all APIs/pages read consistent product availability.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'catalog_items'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE catalog_items
    ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

  UPDATE catalog_items
  SET
    is_available = COALESCE(is_available, is_active, true),
    is_active = COALESCE(is_active, is_available, true)
  WHERE is_available IS NULL OR is_active IS NULL;

  ALTER TABLE catalog_items ALTER COLUMN is_available SET DEFAULT true;
  ALTER TABLE catalog_items ALTER COLUMN is_active SET DEFAULT true;
END $$;

CREATE OR REPLACE FUNCTION sync_catalog_items_active_flags()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.is_active := COALESCE(NEW.is_active, NEW.is_available, true);
    NEW.is_available := COALESCE(NEW.is_available, NEW.is_active, true);
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NEW.is_available IS NOT DISTINCT FROM OLD.is_available THEN
    NEW.is_available := NEW.is_active;
  ELSIF NEW.is_available IS DISTINCT FROM OLD.is_available
     AND NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    NEW.is_active := NEW.is_available;
  ELSE
    NEW.is_active := COALESCE(NEW.is_active, NEW.is_available, true);
    NEW.is_available := COALESCE(NEW.is_available, NEW.is_active, true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'catalog_items'
  ) THEN
    DROP TRIGGER IF EXISTS trg_sync_catalog_items_active_flags ON catalog_items;
    CREATE TRIGGER trg_sync_catalog_items_active_flags
      BEFORE INSERT OR UPDATE ON catalog_items
      FOR EACH ROW
      EXECUTE FUNCTION sync_catalog_items_active_flags();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_items_is_active
  ON catalog_items(merchant_id, is_active);
