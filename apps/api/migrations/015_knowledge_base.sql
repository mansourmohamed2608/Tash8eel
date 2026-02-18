-- Migration: 015_knowledge_base.sql
-- Description: Add knowledge_base column for AI context

ALTER TABLE merchants
ADD COLUMN IF NOT EXISTS knowledge_base JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN merchants.knowledge_base IS 'Knowledge base data used by AI agents (FAQs, business info, policies).';
