ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS channel VARCHAR(20)
DEFAULT 'whatsapp';

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS channel VARCHAR(20)
DEFAULT 'whatsapp';

CREATE INDEX IF NOT EXISTS idx_conversations_channel
ON conversations(merchant_id, channel);
