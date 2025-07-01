-- Migration: add direction column and rename type to subtype in transactions
-- Generated: 2025-07-01
-- Depends on current schema state

BEGIN;

-- Add new direction column for money flow
ALTER TABLE transactions
  ADD COLUMN direction INT2 NOT NULL DEFAULT 1;

-- Rename existing type column to subtype
ALTER TABLE transactions
  RENAME COLUMN type TO subtype;

-- Update comments
COMMENT ON COLUMN transactions.direction IS '1=MONEY_OUT, 2=MONEY_IN';
COMMENT ON COLUMN transactions.subtype IS '1=EXPENSE, 2=INCOME, 3=TRANSFER';

COMMIT;
