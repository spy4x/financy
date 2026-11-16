-- Payee memory: the category a household last chose for a payee when it saved a bank statement
-- (docs/imports.md, "Payee memory"). The next statement's preview suggests it for that payee's rows.
-- `payee_key` is `payeeKey` from @spy4x/bank-statements (lower case, spacing collapsed, card and
-- reference numbers removed), cut to 200 characters; one row per payee per household.
--
-- The category key includes group_id, so a row can never name another household's category. It
-- cascades: a category leaves only with its household, and its memory goes with it. It is
-- deferrable like the entries' keys (migration 2026_12_16_0009), so a move of a household's data
-- can check it at its commit. `updated_by_user_id` is the member whose save chose the category
-- last, for their data export.
CREATE TABLE IF NOT EXISTS payee_memory (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    payee_key VARCHAR(200) NOT NULL,
    category_id UUID NOT NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT payee_memory_group_payee_key UNIQUE (group_id, payee_key),
    CONSTRAINT payee_memory_category_fkey FOREIGN KEY (group_id, category_id)
        REFERENCES categories (group_id, id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT payee_memory_payee_key_check CHECK (char_length(payee_key) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS idx_payee_memory_category ON payee_memory (category_id);
CREATE INDEX IF NOT EXISTS idx_payee_memory_updated_by ON payee_memory (updated_by_user_id);
