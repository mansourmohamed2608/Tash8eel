-- Migration: Make phone nullable in customers table
-- Phone may not be available when creating customers via WhatsApp (only senderId is known initially)

ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
