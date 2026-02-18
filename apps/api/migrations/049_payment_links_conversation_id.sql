-- Migration 029 - Payment links conversation_id column fix
-- Ensures conversation_id exists and has FK to conversations for older schemas.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_links') THEN
    ALTER TABLE payment_links
      ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(100);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'payment_links_conversation_id_fkey'
    ) THEN
      ALTER TABLE payment_links
        ADD CONSTRAINT payment_links_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_proofs') THEN
    ALTER TABLE payment_proofs
      ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(100);

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'payment_proofs_conversation_id_fkey'
    ) THEN
      ALTER TABLE payment_proofs
        ADD CONSTRAINT payment_proofs_conversation_id_fkey
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;
