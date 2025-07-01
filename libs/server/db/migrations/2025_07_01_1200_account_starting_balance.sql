-- Migration: Convert accounts.balance to starting_balance
-- This renames the balance column to starting_balance to represent
-- the balance when the user started using the app.
-- Current balance will be calculated on frontend as starting_balance + sum(transactions)

-- Rename balance column to starting_balance
ALTER TABLE accounts 
RENAME COLUMN balance TO starting_balance;

-- Update comment to reflect new purpose
COMMENT ON COLUMN accounts.starting_balance IS 'Balance when user started using the app (editable), stored in smallest currency unit';
