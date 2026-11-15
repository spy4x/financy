-- The entries a repeating rule made (#219): `recurring_rule_id` names the rule and
-- `occurrence_date` the occurrence the entry is for, both set or both null. The unique index is
-- what makes the hourly job safe to rerun: an occurrence already made, or made and then deleted
-- (the row stays with `deleted_at` set), inserts nothing a second time.
--
-- No foreign key to `recurring_rules`: deleting a rule keeps the entries it made, and the worker's
-- purge removes a deleted rule for good after 30 days, which a key would refuse or cascade. An
-- entry keeps the id of a purged rule; nothing reads it but the unique index.
--
-- The export file and its import leave both columns out, so an imported entry is a plain one
-- (rules are not exported). A move of a household's data keeps them, as it keeps the rules' ids.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_rule_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS occurrence_date DATE;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_occurrence_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_occurrence_check
    CHECK ((recurring_rule_id IS NULL) = (occurrence_date IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_occurrence
    ON transactions (recurring_rule_id, occurrence_date) WHERE recurring_rule_id IS NOT NULL;
