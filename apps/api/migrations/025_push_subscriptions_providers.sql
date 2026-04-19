-- Migration: 025_push_subscriptions_providers.sql
-- Description: Add provider/platform columns for push subscriptions (FCM/APNs)

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'WEB_PUSH',
  ADD COLUMN IF NOT EXISTS platform VARCHAR(20),
  ADD COLUMN IF NOT EXISTS device_token TEXT;

CREATE INDEX IF NOT EXISTS idx_push_subs_provider ON push_subscriptions(provider);
CREATE INDEX IF NOT EXISTS idx_push_subs_device_token ON push_subscriptions(device_token);
