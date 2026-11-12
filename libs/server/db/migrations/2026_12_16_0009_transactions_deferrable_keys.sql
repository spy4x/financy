-- An entry's account and category keys may wait for the end of the transaction, when a statement
-- asks for it. Moving all of a household's data (libs/server/transactions/transaction-movable.ts)
-- moves its entries, accounts and categories in separate statements, and between them an entry
-- names an account in the other household. That move defers both keys, so they are checked at its
-- commit; every other write still checks them at the end of each statement (INITIALLY IMMEDIATE).
ALTER TABLE transactions ALTER CONSTRAINT transactions_account_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE transactions ALTER CONSTRAINT transactions_category_fkey DEFERRABLE INITIALLY IMMEDIATE;
