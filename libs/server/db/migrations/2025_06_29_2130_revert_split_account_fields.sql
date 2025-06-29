-- Revert the split of account_id into from_account_id and to_account_id
-- This simplifies the transfer logic while keeping all transfer functionality

-- Add back account_id column
ALTER TABLE transactions ADD COLUMN account_id INT4 REFERENCES accounts(id) ON DELETE CASCADE;

-- Migrate data: from_account_id becomes account_id for all transactions
UPDATE transactions SET account_id = from_account_id;

-- Make account_id NOT NULL
ALTER TABLE transactions ALTER COLUMN account_id SET NOT NULL;

-- Drop the old columns
ALTER TABLE transactions DROP COLUMN from_account_id;
ALTER TABLE transactions DROP COLUMN to_account_id;

-- Update the transfer logic check constraint to use the simpler approach
-- Transfers: type=3, linked_transaction_id IS NOT NULL, category_id IS NULL
-- Regular transactions: type IN (1,2), linked_transaction_id IS NULL, category_id IS NOT NULL
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transfer_logic_check;
ALTER TABLE transactions ADD CONSTRAINT transfer_logic_check CHECK (
    (type = 3 AND linked_transaction_id IS NOT NULL AND category_id IS NULL) OR
    (type IN (1, 2) AND linked_transaction_id IS NULL AND category_id IS NOT NULL)
);

-- Update comments
COMMENT ON COLUMN transactions.account_id IS 'Account for the transaction (source for transfers and regular transactions)';

-- Update indexes (drop old ones and create new one)
DROP INDEX IF EXISTS idx_transactions_to_account_id;
CREATE INDEX idx_transactions_by_account ON transactions (account_id);
