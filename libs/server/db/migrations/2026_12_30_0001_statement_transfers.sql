-- Transfers a bank statement import saved (#344, docs/imports.md, "The bank statement kind"). A
-- statement row that is the other side of an entry in another of the household's accounts is saved
-- as one transfer between the two accounts, and that other entry goes to the deleted list.
-- `transfers.import_batch_id` names the import that saved the transfer, so its undo removes exactly
-- that batch. `transactions.replaced_by_import_id` names the import that replaced the entry with a
-- transfer, so the same undo brings exactly those entries back.
--
-- Both are null for anything a person typed, the repeating job made or a household's export file
-- brought in. The import keys are SET NULL: an import goes with its uploader or its group, and the
-- transfers stay, as do the replaced entries in the deleted list. A move of a household's data
-- keeps both, as it keeps the ids; the import stays in the old household, so its undo there finds
-- none of them.
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE transfers DROP CONSTRAINT IF EXISTS transfers_import_batch_fkey;
ALTER TABLE transfers ADD CONSTRAINT transfers_import_batch_fkey
    FOREIGN KEY (import_batch_id) REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS replaced_by_import_id UUID;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_replaced_by_import_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_replaced_by_import_fkey
    FOREIGN KEY (replaced_by_import_id) REFERENCES imports(id) ON DELETE SET NULL;

-- An import's undo, and the import keys' SET NULL when an import is deleted.
CREATE INDEX IF NOT EXISTS idx_transfers_import_batch
    ON transfers (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_replaced_by_import
    ON transactions (replaced_by_import_id) WHERE replaced_by_import_id IS NOT NULL;
