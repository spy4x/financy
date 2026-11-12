-- Transactions: a household's income and expense entries (docs/aggregates.md). An entry belongs to
-- one household (a group), moves money in one of its accounts and is sorted by one of its
-- categories. Both foreign keys include group_id, so an entry can never name another household's
-- account or category (R17), whatever the code above it does.
--
-- An entry keeps two facts (R4): what was paid (`amount` in `currency`) and what moved in the
-- account (`account_amount`, in the account's currency). Both are signed by the kind (R5): an
-- expense is negative, an income positive. `converted` is true when the server filled the account
-- amount from the rate of the entry's date; false when the person stated it or the currencies are
-- the same. Amounts are the currency's smallest unit, within plus or minus
-- Number.MAX_SAFE_INTEGER, so they cross JSON as exact numbers (R1, R3).
--
-- `date` is a calendar date in the household's time zone (R14). `kind` is 1 expense, 2 income.
-- A delete keeps the row with `deleted_at` set for 30 days, so it can be restored; the worker's
-- cleanup then removes it, before it purges accounts. The account and category keys are NO ACTION,
-- checked at the end of the statement: a purge or a delete of a row an entry names fails, while a
-- group's delete removes the entries together with its accounts and categories.
ALTER TABLE accounts ADD CONSTRAINT accounts_group_id_id_key UNIQUE (group_id, id);

CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    account_id UUID NOT NULL,
    category_id UUID NOT NULL,
    kind INT2 NOT NULL,
    account_amount BIGINT NOT NULL,
    amount BIGINT NOT NULL,
    currency VARCHAR(12) NOT NULL,
    converted BOOLEAN DEFAULT false NOT NULL,
    memo VARCHAR(500) DEFAULT '' NOT NULL,
    date DATE NOT NULL,
    version INT4 DEFAULT 1 NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ(3),
    CONSTRAINT transactions_account_fkey FOREIGN KEY (group_id, account_id)
        REFERENCES accounts (group_id, id),
    CONSTRAINT transactions_category_fkey FOREIGN KEY (group_id, category_id)
        REFERENCES categories (group_id, id),
    CONSTRAINT transactions_kind_check CHECK (kind BETWEEN 1 AND 2),
    CONSTRAINT transactions_sign_check CHECK (
        (kind = 1 AND account_amount < 0 AND amount < 0)
        OR (kind = 2 AND account_amount > 0 AND amount > 0)
    ),
    CONSTRAINT transactions_amount_check
        CHECK (amount BETWEEN -9007199254740991 AND 9007199254740991),
    CONSTRAINT transactions_account_amount_check
        CHECK (account_amount BETWEEN -9007199254740991 AND 9007199254740991),
    CONSTRAINT transactions_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT transactions_memo_check CHECK (char_length(memo) <= 500),
    CONSTRAINT transactions_version_check CHECK (version >= 1),
    CONSTRAINT transactions_change_sequence_check CHECK (change_sequence >= 1)
);

-- An account's balance on a day, and whether it has entries (the currency lock, the delete check).
CREATE INDEX idx_transactions_account_date ON transactions (account_id, date);
-- Whether a category has entries (the kind lock).
CREATE INDEX idx_transactions_category ON transactions (category_id);
-- The ledger: a household's live entries in a period.
CREATE INDEX idx_transactions_group_date ON transactions (group_id, date) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_group_change_sequence ON transactions (group_id, change_sequence);
-- The worker's purge of entries deleted longer ago than the restore window.
CREATE INDEX idx_transactions_deleted_at ON transactions (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_transactions_created_by ON transactions (created_by_user_id);
CREATE INDEX idx_transactions_updated_by ON transactions (updated_by_user_id);
