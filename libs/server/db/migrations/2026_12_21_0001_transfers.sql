-- Transfers: money a household moves between two of its own accounts (docs/aggregates.md). One
-- row holds both sides (product.md: "a transfer is one record with two sides"): the from account
-- loses `sent_amount` in its currency, the to account gains `received_amount` in its own (R5).
-- Both foreign keys include group_id, so a transfer can never name another household's account
-- (R17), whatever the code above it does. No category column exists, so a transfer can never carry
-- one and counts in no income or spending figure (R12).
--
-- Both amounts are positive, in their currency's smallest unit, within Number.MAX_SAFE_INTEGER, so
-- they cross JSON as exact numbers (R1, R3). `converted` is true when the server filled the
-- received amount from the rate of the transfer's date; false when the person stated it or both
-- accounts hold one currency. The implied rate (received over sent) is never stored.
--
-- `date` is a calendar date in the household's time zone (R14). A delete keeps the row with
-- `deleted_at` set for 30 days, so it can be restored; the worker's cleanup then removes it, before
-- it purges accounts. The account keys are NO ACTION and deferrable, like the entries' keys
-- (2026_12_16_0009_transactions_deferrable_keys.sql): every write checks them at the end of its
-- statement, and a move of all of a household's data may defer them to its commit.
CREATE TABLE transfers (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_account_id UUID NOT NULL,
    to_account_id UUID NOT NULL,
    sent_amount BIGINT NOT NULL,
    received_amount BIGINT NOT NULL,
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
    CONSTRAINT transfers_from_account_fkey FOREIGN KEY (group_id, from_account_id)
        REFERENCES accounts (group_id, id) DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT transfers_to_account_fkey FOREIGN KEY (group_id, to_account_id)
        REFERENCES accounts (group_id, id) DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT transfers_accounts_differ_check CHECK (from_account_id <> to_account_id),
    CONSTRAINT transfers_sent_amount_check CHECK (sent_amount BETWEEN 1 AND 9007199254740991),
    CONSTRAINT transfers_received_amount_check
        CHECK (received_amount BETWEEN 1 AND 9007199254740991),
    CONSTRAINT transfers_memo_check CHECK (char_length(memo) <= 500),
    CONSTRAINT transfers_version_check CHECK (version >= 1),
    CONSTRAINT transfers_change_sequence_check CHECK (change_sequence >= 1)
);

-- An account's balance on a day, and whether a transfer names it (the currency lock, the delete
-- check), on either side.
CREATE INDEX idx_transfers_from_account_date ON transfers (from_account_id, date);
CREATE INDEX idx_transfers_to_account_date ON transfers (to_account_id, date);
CREATE INDEX idx_transfers_group_change_sequence ON transfers (group_id, change_sequence);
-- The worker's purge of transfers deleted longer ago than the restore window.
CREATE INDEX idx_transfers_deleted_at ON transfers (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_transfers_created_by ON transfers (created_by_user_id);
CREATE INDEX idx_transfers_updated_by ON transfers (updated_by_user_id);
