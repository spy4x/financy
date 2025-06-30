-- Add user-editable timestamp field to transactions table
-- This separates the technical creation timestamp (created_at) from the user-visible transaction time

-- Step 1: Add the new timestamp column, defaulting to created_at for existing records
ALTER TABLE transactions ADD COLUMN timestamp TIMESTAMPTZ;

-- Step 2: Update existing transactions to use created_at as the initial timestamp
UPDATE transactions SET timestamp = created_at WHERE timestamp IS NULL;

-- Step 3: Make timestamp NOT NULL and set default to current time for new records
ALTER TABLE transactions ALTER COLUMN timestamp SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN timestamp SET DEFAULT now();

-- Step 4: Add index for efficient sorting and filtering by transaction timestamp
CREATE INDEX idx_transactions_by_timestamp ON transactions (timestamp DESC);

-- Step 5: Add comment for the new column
COMMENT ON COLUMN transactions.timestamp IS 'User-editable transaction timestamp (when the transaction actually occurred)';
