-- Fix transfer_logic_check constraint
-- Remove the requirement for linked_transaction_id IS NOT NULL during creation
-- since transfers are linked after both transactions are created

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transfer_logic_check;

ALTER TABLE transactions 
ADD CONSTRAINT transfer_logic_check CHECK (
    (type = 3 AND category_id IS NULL) OR
    (type IN (1, 2) AND category_id IS NOT NULL)
);
