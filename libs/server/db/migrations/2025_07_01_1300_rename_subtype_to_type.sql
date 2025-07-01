-- Migration: rename subtype column back to type in transactions
-- Generated: 2025-07-01
-- Depends on 2025_07_01_1200_add_transaction_direction_and_subtype.sql

BEGIN;

-- Rename subtype column back to type for better UX
ALTER TABLE transactions
  RENAME COLUMN subtype TO type;

-- Update comment
COMMENT ON COLUMN transactions.type IS '1=EXPENSE, 2=INCOME, 3=TRANSFER';

COMMIT;
