-- Migration: Fix messages table - content column should be nullable or populated from text
-- The codebase uses 'text' column but original schema had 'content' as NOT NULL

-- Option 1: Make content nullable (safest since we're using text column)
ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;

-- Also set a default for existing NULL content values
UPDATE messages SET content = COALESCE(text, '') WHERE content IS NULL;
