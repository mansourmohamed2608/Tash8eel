-- Migration: make messages.content nullable when column exists.
-- Some databases already migrated away from `content`; this migration must be idempotent.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'messages'
			AND column_name = 'content'
	) THEN
		EXECUTE 'ALTER TABLE messages ALTER COLUMN content DROP NOT NULL';

		IF EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'messages'
				AND column_name = 'text'
		) THEN
			EXECUTE 'UPDATE messages SET content = COALESCE(text, '''') WHERE content IS NULL';
		ELSE
			EXECUTE 'UPDATE messages SET content = '''' WHERE content IS NULL';
		END IF;
	END IF;
END $$;
