-- Replace linked_transaction_id foreign key with linked_transaction_code string
-- This simplifies the transfer relationship and removes circular foreign key dependencies

-- Step 1: Add the new linked_transaction_code column
ALTER TABLE transactions ADD COLUMN linked_transaction_code VARCHAR(10);

-- Step 2: Drop the old index
DROP INDEX IF EXISTS idx_transactions_linked_transaction_id;

-- Step 3: Remove the old column
ALTER TABLE transactions DROP COLUMN IF EXISTS linked_transaction_id;

-- Step 4: Create index on the new column for efficient lookups
CREATE INDEX idx_transactions_linked_transaction_code ON transactions(linked_transaction_code) 
    WHERE linked_transaction_code IS NOT NULL;

-- Step 5: Add comment for the new column
COMMENT ON COLUMN transactions.linked_transaction_code IS 'Random string linking transfer transaction pairs (e.g., "abc123xyz0")';
