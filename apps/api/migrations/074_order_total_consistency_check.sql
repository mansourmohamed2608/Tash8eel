-- Migration 074: Enforce order total consistency invariant
-- ============================================================================
-- Invariant: orders.total = orders.subtotal - orders.discount + orders.delivery_fee
-- ============================================================================
-- A INSERT or UPDATE that produces a mismatched total will be rejected with a
-- clear error message. This prevents divergent monetary values being displayed
-- on different pages (order list vs. order detail vs. invoice).
--
-- Tolerance: 0.01 EGP (1 piaster) to accommodate floating-point rounding in
-- the application layer.  All values should be stored as DECIMAL(10,2) but
-- we use ROUND(..., 2) on both sides to be safe.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_check_order_total()
RETURNS TRIGGER AS $$
DECLARE
  expected DECIMAL(12,2);
BEGIN
  -- Only validate when all four monetary columns are populated.
  -- During partial UPDATE (e.g. status-only change) the NEW values retain
  -- the previous row values so the invariant will still be checked.
  IF NEW.subtotal IS NOT NULL
     AND NEW.discount IS NOT NULL
     AND NEW.delivery_fee IS NOT NULL
     AND NEW.total IS NOT NULL
  THEN
    expected := ROUND(NEW.subtotal - NEW.discount + NEW.delivery_fee, 2);
    IF ABS(ROUND(NEW.total, 2) - expected) > 0.01 THEN
      RAISE EXCEPTION
        'Order total invariant violated for order %: total=% but subtotal(%)  - discount(%) + delivery_fee(%) = %',
        NEW.id,
        ROUND(NEW.total, 2),
        NEW.subtotal,
        NEW.discount,
        NEW.delivery_fee,
        expected;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger (idempotent: drop first if already exists)
DROP TRIGGER IF EXISTS trg_check_order_total ON orders;
CREATE TRIGGER trg_check_order_total
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_check_order_total();

-- ============================================================================
-- Backfill: detect and log any existing rows that already violate the invariant
-- (we log, not fail, because fixing historical data is a separate concern)
-- ============================================================================
DO $$
DECLARE
  violation_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO violation_count
    FROM orders
   WHERE ABS(ROUND(total, 2) -
             ROUND(subtotal - discount + delivery_fee, 2)) > 0.01;

  IF violation_count > 0 THEN
    RAISE WARNING
      'Migration 074: Found % order(s) with total != subtotal - discount + delivery_fee. '
      'These must be investigated and corrected manually. '
      'Run: SELECT id, order_number, total, subtotal, discount, delivery_fee, '
      '(subtotal - discount + delivery_fee) AS expected_total FROM orders '
      'WHERE ABS(ROUND(total,2) - ROUND(subtotal - discount + delivery_fee, 2)) > 0.01;',
      violation_count;
  ELSE
    RAISE NOTICE 'Migration 074: All existing orders satisfy the total invariant.';
  END IF;
END;
$$;
