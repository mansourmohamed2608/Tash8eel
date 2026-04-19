-- Migration 112
-- Canonicalize merchant-facing billing catalog semantics and suppress legacy alias duplicates.
-- Goal: keep one active SKU per merchant meaning where alias pairs exist.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Add-on alias cleanup
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'add_ons') THEN
    WITH alias_pairs AS (
      SELECT * FROM (
        VALUES
          ('TEAM_UPTO3', 'TEAM_UP_TO_3'),
          ('POS_INTEGRATIONS_BASIC', 'POS_BASIC'),
          ('POS_INTEGRATIONS_ADVANCED', 'POS_ADV'),
          ('MULTI_BRANCH_EXTRA', 'MULTI_BRANCH_PER_1'),
          ('MULTI_BRANCH', 'MULTI_BRANCH_PER_1')
      ) AS v(alias_code, canonical_code)
    )
    UPDATE add_ons alias
    SET is_active = false,
        updated_at = NOW()
    FROM alias_pairs p
    JOIN add_ons canonical
      ON canonical.code = p.canonical_code
     AND canonical.is_active = true
    WHERE alias.code = p.alias_code
      AND alias.is_active = true;

    UPDATE add_ons
    SET is_active = true,
        updated_at = NOW()
    WHERE code IN (
      'TEAM_UP_TO_3',
      'POS_BASIC',
      'POS_ADV',
      'MULTI_BRANCH_PER_1'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Usage-pack alias cleanup
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_packs') THEN
    WITH alias_pairs AS (
      SELECT * FROM (
        VALUES
          ('AI_CAPACITY_S', 'AI_BOOST_S'),
          ('AI_CAPACITY_M', 'AI_BOOST_M'),
          ('AI_CAPACITY_L', 'AI_BOOST_L'),
          ('AI_CAPACITY_XL', 'AI_BOOST_XL'),
          ('PROOF_CHECKS_S', 'PROOF_S'),
          ('PROOF_CHECKS_M', 'PROOF_M'),
          ('PROOF_CHECKS_L', 'PROOF_L'),
          ('PROOF_CHECKS_XL', 'PROOF_XL'),
          ('VOICE_MINUTES_S', 'VOICE_S'),
          ('VOICE_MINUTES_M', 'VOICE_M'),
          ('VOICE_MINUTES_L', 'VOICE_L'),
          ('VOICE_MINUTES_XL', 'VOICE_XL'),
          ('PAID_TEMPLATES_S', 'TEMPLATE_S'),
          ('PAID_TEMPLATES_M', 'TEMPLATE_M'),
          ('PAID_TEMPLATES_L', 'TEMPLATE_L')
      ) AS v(alias_code, canonical_code)
    )
    UPDATE usage_packs alias
    SET is_active = false,
        updated_at = NOW()
    FROM alias_pairs p
    JOIN usage_packs canonical
      ON canonical.code = p.canonical_code
     AND canonical.is_active = true
    WHERE alias.code = p.alias_code
      AND alias.is_active = true;

    UPDATE usage_packs
    SET is_active = true,
        updated_at = NOW()
    WHERE code IN (
      'AI_BOOST_S',
      'AI_BOOST_M',
      'AI_BOOST_L',
      'AI_BOOST_XL',
      'PROOF_S',
      'PROOF_M',
      'PROOF_L',
      'PROOF_XL',
      'VOICE_S',
      'VOICE_M',
      'VOICE_L',
      'VOICE_XL',
      'TEMPLATE_S',
      'TEMPLATE_M',
      'TEMPLATE_L'
    );
  END IF;
END $$;

COMMIT;
