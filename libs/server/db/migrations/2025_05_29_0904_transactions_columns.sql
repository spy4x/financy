-- Rename column "transaction_type" to "type"
ALTER TABLE transactions
RENAME COLUMN transaction_type TO type;

-- Rename column "amount_original" to "original_amount"
ALTER TABLE transactions
RENAME COLUMN amount_original TO original_amount;