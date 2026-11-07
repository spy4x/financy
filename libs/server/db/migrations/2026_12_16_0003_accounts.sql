-- Accounts: Financy's first finance aggregate (docs/aggregates.md). An account belongs to one
-- household (a group) and holds money in one currency. Every member reads a household's accounts
-- and an editor or above writes them; the handlers check that, and every write checks it again on
-- the locked membership row.
--
-- The currency is an ISO 4217 code, never an id. The starting balance is in that currency's
-- smallest unit; its CHECK keeps it within plus or minus Number.MAX_SAFE_INTEGER, so it crosses
-- JSON as an exact number. The balance is derived (the starting balance plus the account's live
-- entries), never stored. `kind` is a label only: 1 cash, 2 bank, 3 card, 4 savings, 5 asset,
-- 6 liability.
--
-- A delete keeps the row with `deleted_at` set for 30 days, so it can be restored; the worker's
-- cleanup then removes it. Finance rows that point at an account will reference it with
-- ON DELETE RESTRICT, so a purge can never remove an account a transaction names.
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    kind INT2 NOT NULL,
    currency VARCHAR(12) NOT NULL,
    starting_balance BIGINT DEFAULT 0 NOT NULL,
    archived_at TIMESTAMPTZ(3),
    is_default BOOLEAN DEFAULT false NOT NULL,
    version INT4 DEFAULT 1 NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ(3),
    CONSTRAINT accounts_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 60),
    CONSTRAINT accounts_kind_check CHECK (kind BETWEEN 1 AND 6),
    CONSTRAINT accounts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT accounts_starting_balance_check
        CHECK (starting_balance BETWEEN -9007199254740991 AND 9007199254740991),
    CONSTRAINT accounts_default_live_check
        CHECK (NOT is_default OR (archived_at IS NULL AND deleted_at IS NULL)),
    CONSTRAINT accounts_version_check CHECK (version >= 1),
    CONSTRAINT accounts_change_sequence_check CHECK (change_sequence >= 1)
);

-- One default per household.
CREATE UNIQUE INDEX idx_accounts_group_default ON accounts (group_id) WHERE is_default;
-- The list: a household's live accounts; the trash is read through the same index's group prefix.
CREATE INDEX idx_accounts_group_live ON accounts (group_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_group_change_sequence ON accounts (group_id, change_sequence);
-- The worker's purge of accounts deleted longer ago than the restore window.
CREATE INDEX idx_accounts_deleted_at ON accounts (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_accounts_created_by ON accounts (created_by_user_id);
CREATE INDEX idx_accounts_updated_by ON accounts (updated_by_user_id);
