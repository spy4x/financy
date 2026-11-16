-- Entries a bank statement import saved (#299, docs/imports.md, "The bank statement kind").
-- `bank_reference` is the bank's own id for the row (an OFX FITID, a CAMT.053 AcctSvcrRef, an
-- MT940 bank reference), so a second import of the same statement finds the rows it saved before.
-- `import_batch_id` names the import that saved the entry, so its undo removes exactly that batch.
--
-- Both are null for an entry a person typed, the repeating job made or a household's export file
-- brought in. The import key is SET NULL: an import goes with its uploader or its group, and the
-- entries it saved stay. A move of a household's data keeps both, as it keeps the entries' ids;
-- the import stays in the old household, so its undo there finds none of them.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(255);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_batch_id UUID;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_import_batch_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_import_batch_fkey
    FOREIGN KEY (import_batch_id) REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_bank_reference_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_bank_reference_check
    CHECK (bank_reference IS NULL OR char_length(bank_reference) BETWEEN 1 AND 255);

-- The duplicate check of an import: an account's live entries with a bank reference.
CREATE INDEX IF NOT EXISTS idx_transactions_account_bank_reference
    ON transactions (account_id, bank_reference)
    WHERE deleted_at IS NULL AND bank_reference IS NOT NULL;
-- An import's undo, and the import key's SET NULL when an import is deleted.
CREATE INDEX IF NOT EXISTS idx_transactions_import_batch
    ON transactions (import_batch_id) WHERE import_batch_id IS NOT NULL;
