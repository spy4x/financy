-- Add default_account_id to groups table
-- This allows groups to have a default account for new transactions

ALTER TABLE groups 
ADD COLUMN default_account_id INT4 REFERENCES accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN groups.default_account_id IS 'Default account for new transactions in this group (FK to accounts table)';
