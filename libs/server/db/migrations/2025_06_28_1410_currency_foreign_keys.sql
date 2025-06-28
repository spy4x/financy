-- Update groups and accounts to use currency foreign keys instead of currency codes
-- This migration adds foreign key constraints to the currencies table

-- Add new currency_id columns 
ALTER TABLE groups ADD COLUMN currency_id INT4;
ALTER TABLE accounts ADD COLUMN currency_id INT4;
ALTER TABLE transactions ADD COLUMN original_currency_id INT4;

-- Update groups with currency_id based on default_currency code
UPDATE groups 
SET currency_id = (
    SELECT id 
    FROM currencies 
    WHERE code = groups.default_currency 
    AND deleted_at IS NULL
    LIMIT 1
);

-- Update accounts with currency_id based on currency code
UPDATE accounts 
SET currency_id = (
    SELECT id 
    FROM currencies 
    WHERE code = accounts.currency 
    AND deleted_at IS NULL
    LIMIT 1
);

-- Update transactions with original_currency_id based on original_currency code
-- Only update where original_currency is not null
UPDATE transactions 
SET original_currency_id = (
    SELECT id 
    FROM currencies 
    WHERE code = transactions.original_currency 
    AND deleted_at IS NULL
    LIMIT 1
)
WHERE original_currency IS NOT NULL;

-- Make currency_id NOT NULL and add foreign key constraints
ALTER TABLE groups 
    ALTER COLUMN currency_id SET NOT NULL,
    ADD CONSTRAINT fk_groups_currency_id FOREIGN KEY (currency_id) REFERENCES currencies(id);

ALTER TABLE accounts 
    ALTER COLUMN currency_id SET NOT NULL,
    ADD CONSTRAINT fk_accounts_currency_id FOREIGN KEY (currency_id) REFERENCES currencies(id);

-- Add foreign key constraint for transactions (original_currency_id can be null)
ALTER TABLE transactions 
    ADD CONSTRAINT fk_transactions_original_currency_id FOREIGN KEY (original_currency_id) REFERENCES currencies(id);

-- Drop old currency code columns
ALTER TABLE groups DROP COLUMN default_currency;
ALTER TABLE accounts DROP COLUMN currency;
ALTER TABLE transactions DROP COLUMN original_currency;

-- Add comments for new columns
COMMENT ON COLUMN groups.currency_id IS 'Default currency for the group (FK to currencies table)';
COMMENT ON COLUMN accounts.currency_id IS 'Account currency (FK to currencies table)';
COMMENT ON COLUMN transactions.original_currency_id IS 'Original currency from vendor (FK to currencies table), null if same as account currency';

-- Add indexes for performance
CREATE INDEX idx_groups_by_currency ON groups (currency_id);
CREATE INDEX idx_accounts_by_currency ON accounts (currency_id);
CREATE INDEX idx_transactions_by_original_currency ON transactions (original_currency_id);
