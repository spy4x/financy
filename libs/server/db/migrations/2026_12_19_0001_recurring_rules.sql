-- Repeating rules: a household's entry that comes back on a schedule (docs/aggregates.md). A rule
-- holds the entry's template (account, category, kind, amount, currency, memo) and its repeat: the
-- RRULE text, which names only the frequency, the interval and the days, plus the start date and
-- at most one end, a last date or a number of occurrences. `skipped_dates` are occurrences a member
-- skipped. `made_through` and `paused_reason` belong to the job that makes the entries (#103); no
-- command sets them.
--
-- `amount` is positive in `currency`'s smallest unit; the kind gives the sign, as on an entry.
-- `account_amount` is the amount in the account's currency when a person stated it, else null.
-- Both are within Number.MAX_SAFE_INTEGER, so they cross JSON as exact numbers. `kind` is 1
-- expense, 2 income. Both foreign keys include group_id, so a rule can never name another
-- household's account or category (R17). They are deferrable like the entries' keys (migration
-- 2026_12_16_0009), so a move of a household's data can check them at its commit. A delete keeps
-- the row with `deleted_at` set for 30 days; the worker's cleanup then removes it, before it
-- purges accounts.
CREATE TABLE recurring_rules (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    account_id UUID NOT NULL,
    category_id UUID NOT NULL,
    kind INT2 NOT NULL,
    amount BIGINT NOT NULL,
    account_amount BIGINT,
    currency VARCHAR(12) NOT NULL,
    memo VARCHAR(500) DEFAULT '' NOT NULL,
    rrule VARCHAR(200) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    count INT4,
    skipped_dates DATE[] DEFAULT '{}' NOT NULL,
    made_through DATE,
    paused_reason INT2,
    version INT4 DEFAULT 1 NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ(3),
    CONSTRAINT recurring_rules_account_fkey FOREIGN KEY (group_id, account_id)
        REFERENCES accounts (group_id, id) DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT recurring_rules_category_fkey FOREIGN KEY (group_id, category_id)
        REFERENCES categories (group_id, id) DEFERRABLE INITIALLY IMMEDIATE,
    CONSTRAINT recurring_rules_kind_check CHECK (kind BETWEEN 1 AND 2),
    CONSTRAINT recurring_rules_amount_check CHECK (amount BETWEEN 1 AND 9007199254740991),
    CONSTRAINT recurring_rules_account_amount_check
        CHECK (account_amount BETWEEN 1 AND 9007199254740991),
    CONSTRAINT recurring_rules_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT recurring_rules_memo_check CHECK (char_length(memo) <= 500),
    CONSTRAINT recurring_rules_rrule_check CHECK (char_length(rrule) BETWEEN 1 AND 200),
    CONSTRAINT recurring_rules_end_check CHECK (end_date IS NULL OR count IS NULL),
    CONSTRAINT recurring_rules_end_date_check CHECK (end_date >= start_date),
    CONSTRAINT recurring_rules_count_check CHECK (count BETWEEN 1 AND 1000),
    CONSTRAINT recurring_rules_skipped_dates_check CHECK (cardinality(skipped_dates) <= 500),
    CONSTRAINT recurring_rules_paused_reason_check CHECK (paused_reason >= 1),
    CONSTRAINT recurring_rules_version_check CHECK (version >= 1),
    CONSTRAINT recurring_rules_change_sequence_check CHECK (change_sequence >= 1)
);

CREATE INDEX idx_recurring_rules_group_change_sequence
    ON recurring_rules (group_id, change_sequence);
-- The account delete's check for a live rule, and the category's.
CREATE INDEX idx_recurring_rules_account ON recurring_rules (account_id);
CREATE INDEX idx_recurring_rules_category ON recurring_rules (category_id);
-- The worker's purge of rules deleted longer ago than the restore window.
CREATE INDEX idx_recurring_rules_deleted_at
    ON recurring_rules (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_recurring_rules_created_by ON recurring_rules (created_by_user_id);
CREATE INDEX idx_recurring_rules_updated_by ON recurring_rules (updated_by_user_id);
