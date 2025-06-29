-- Migration: Add transfer account validation constraint
-- Description: Enhance transfer_logic_check to ensure from_account_id and to_account_id are different for transfers
-- Date: 2025-01-17

-- Drop the existing constraint
ALTER TABLE transactions DROP CONSTRAINT transfer_logic_check;

-- Add the enhanced constraint that includes account difference validation
ALTER TABLE transactions ADD CONSTRAINT transfer_logic_check CHECK (
    (type = 3 AND to_account_id IS NOT NULL AND category_id IS NULL AND from_account_id != to_account_id) OR
    (type IN (1, 2) AND to_account_id IS NULL AND category_id IS NOT NULL)
);
