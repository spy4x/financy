-- =============================================================================
-- Transfer Improvements Migration
-- =============================================================================
-- This migration adds proper transfer support with linked transactions
-- and improves the transaction schema for better transfer handling.
--
-- Changes:
-- 1. Rename account_id to from_account_id for clarity
-- 2. Add to_account_id for transfer destinations
-- 3. Add TRANSFER transaction type (3)
-- 4. Add linked_transaction_id for cross-linking transfer transactions
-- 5. Make category_id nullable for transfers
-- 6. Add proper constraints for transfer logic
--
-- Date: 2025-06-29
-- =============================================================================

-- Step 1: Rename account_id to from_account_id for better clarity
ALTER TABLE transactions RENAME COLUMN account_id TO from_account_id;

-- Step 2: Add to_account_id for transfer destinations
ALTER TABLE transactions ADD COLUMN to_account_id INT4 REFERENCES accounts(id);

-- Step 3: Add linked_transaction_id for cross-linking transfer transactions
ALTER TABLE transactions ADD COLUMN linked_transaction_id INT4 REFERENCES transactions(id);

-- Step 4: Make category_id nullable for transfers
ALTER TABLE transactions ALTER COLUMN category_id DROP NOT NULL;

-- Step 5: Update type constraint to include TRANSFER (type 3)
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check 
    CHECK (type IN (1, 2, 3)); -- 1=DEBIT, 2=CREDIT, 3=TRANSFER

-- Step 6: Add transfer logic constraints
ALTER TABLE transactions ADD CONSTRAINT transfer_logic_check 
    CHECK (
        -- For TRANSFER: to_account_id must be set, category_id must be NULL
        (type = 3 AND to_account_id IS NOT NULL AND category_id IS NULL) OR
        -- For DEBIT/CREDIT: to_account_id must be NULL, category_id must be set
        (type IN (1, 2) AND to_account_id IS NULL AND category_id IS NOT NULL)
    );

-- Step 7: Add indexes for performance
CREATE INDEX idx_transactions_to_account_id ON transactions(to_account_id) 
    WHERE to_account_id IS NOT NULL;

CREATE INDEX idx_transactions_linked_transaction_id ON transactions(linked_transaction_id) 
    WHERE linked_transaction_id IS NOT NULL;

CREATE INDEX idx_transactions_type ON transactions(type);

-- Step 8: Add comments for documentation
COMMENT ON COLUMN transactions.from_account_id IS 'Source account for the transaction (renamed from account_id)';
COMMENT ON COLUMN transactions.to_account_id IS 'Destination account for transfers (NULL for regular transactions)';
COMMENT ON COLUMN transactions.linked_transaction_id IS 'Links to the corresponding transaction in transfer pairs';
COMMENT ON COLUMN transactions.type IS '1=DEBIT (money out), 2=CREDIT (money in), 3=TRANSFER (linked pair)';
