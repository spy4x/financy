-- A budget row's and an envelope move's category keys may wait for the end of the transaction,
-- when a statement asks for it. Moving all of a household's data
-- (libs/server/budgets/budget-movable.ts) moves its budget rows, envelope moves and categories in
-- separate statements, and between them a row names a category in the other household. That move
-- defers the keys, so they are checked at its commit; every other write still checks them at the
-- end of each statement (INITIALLY IMMEDIATE).
ALTER TABLE budgets ALTER CONSTRAINT budgets_category_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE budget_moves
    ALTER CONSTRAINT budget_moves_from_category_fkey DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE budget_moves
    ALTER CONSTRAINT budget_moves_to_category_fkey DEFERRABLE INITIALLY IMMEDIATE;
