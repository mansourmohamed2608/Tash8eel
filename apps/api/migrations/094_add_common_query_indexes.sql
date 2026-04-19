CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_created_at
ON conversations(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_outbox_events_status
ON outbox_events(status);
