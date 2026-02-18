-- Unify staff references and notification preferences schema

-- Drop foreign keys that reference staff_members (if any) and re-add to merchant_staff
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_members') THEN
    FOR r IN
      SELECT conname, conrelid::regclass AS table_name
      FROM pg_constraint
      WHERE contype = 'f'
        AND confrelid = 'staff_members'::regclass
        AND conrelid::regclass::text IN ('notifications', 'notification_preferences', 'push_subscriptions')
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.table_name, r.conname);
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'merchant_staff') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'notifications_staff_id_fkey' AND conrelid = 'notifications'::regclass
      ) THEN
        ALTER TABLE notifications
          ADD CONSTRAINT notifications_staff_id_fkey
          FOREIGN KEY (staff_id) REFERENCES merchant_staff(id) ON DELETE CASCADE;
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_preferences') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'notification_preferences_staff_id_fkey' AND conrelid = 'notification_preferences'::regclass
      ) THEN
        ALTER TABLE notification_preferences
          ADD CONSTRAINT notification_preferences_staff_id_fkey
          FOREIGN KEY (staff_id) REFERENCES merchant_staff(id) ON DELETE CASCADE;
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'push_subscriptions') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_staff_id_fkey' AND conrelid = 'push_subscriptions'::regclass
      ) THEN
        ALTER TABLE push_subscriptions
          ADD CONSTRAINT push_subscriptions_staff_id_fkey
          FOREIGN KEY (staff_id) REFERENCES merchant_staff(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

-- Normalize notification_preferences schema (legacy format -> new format)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences' AND column_name = 'notification_type'
  ) THEN
    ALTER TABLE notification_preferences RENAME TO notification_preferences_legacy;

    CREATE TABLE notification_preferences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      merchant_id VARCHAR(100) NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      staff_id UUID REFERENCES merchant_staff(id) ON DELETE CASCADE,
      email_enabled BOOLEAN DEFAULT true,
      push_enabled BOOLEAN DEFAULT true,
      whatsapp_enabled BOOLEAN DEFAULT false,
      quiet_hours_start VARCHAR(5),
      quiet_hours_end VARCHAR(5),
      enabled_types TEXT[] DEFAULT ARRAY[
        'ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
        'LOW_STOCK', 'ESCALATED_CONVERSATION', 'PAYMENT_RECEIVED',
        'DAILY_SUMMARY', 'SECURITY_ALERT'
      ],
      email_address VARCHAR(255),
      whatsapp_number VARCHAR(20),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_prefs_per_user
      ON notification_preferences(merchant_id, COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'::uuid));
    CREATE INDEX IF NOT EXISTS idx_notification_prefs_merchant ON notification_preferences(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_notification_prefs_staff ON notification_preferences(staff_id) WHERE staff_id IS NOT NULL;

    INSERT INTO notification_preferences (
      merchant_id,
      staff_id,
      email_enabled,
      push_enabled,
      whatsapp_enabled,
      enabled_types,
      created_at,
      updated_at
    )
    SELECT
      merchant_id,
      staff_id,
      COALESCE(BOOL_OR(channel = 'email' AND enabled), true) AS email_enabled,
      COALESCE(BOOL_OR(channel = 'push' AND enabled), true) AS push_enabled,
      COALESCE(BOOL_OR(channel = 'whatsapp' AND enabled), false) AS whatsapp_enabled,
      COALESCE(
        array_agg(DISTINCT notification_type) FILTER (WHERE enabled),
        ARRAY[
          'ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
          'LOW_STOCK', 'ESCALATED_CONVERSATION', 'PAYMENT_RECEIVED',
          'DAILY_SUMMARY', 'SECURITY_ALERT'
        ]
      ) AS enabled_types,
      MIN(created_at),
      MAX(updated_at)
    FROM notification_preferences_legacy
    GROUP BY merchant_id, staff_id;
  ELSE
    ALTER TABLE notification_preferences
      ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS quiet_hours_start VARCHAR(5),
      ADD COLUMN IF NOT EXISTS quiet_hours_end VARCHAR(5),
      ADD COLUMN IF NOT EXISTS enabled_types TEXT[] DEFAULT ARRAY[
        'ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
        'LOW_STOCK', 'ESCALATED_CONVERSATION', 'PAYMENT_RECEIVED',
        'DAILY_SUMMARY', 'SECURITY_ALERT'
      ],
      ADD COLUMN IF NOT EXISTS email_address VARCHAR(255),
      ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20);
  END IF;
END $$;
