-- Budgets: a household's monthly limit on an expense category (docs/aggregates.md). A row holds one
-- category's amount from one month on, and a month's limit is the latest row at or before it, so
-- changing November never rewrites October. A row with no amount removes the limit from its month
-- on; nothing is deleted, so there is no deleted_at. The rows name no budgeting method: a later
-- envelope method adds rollover on the same rows.
--
-- `month` is always the 1st. `amount` is the currency's smallest unit, above zero and within
-- Number.MAX_SAFE_INTEGER, so it crosses JSON as an exact number; `currency` is an ISO 4217 code,
-- null exactly when the amount is. The category key includes group_id, so a budget can never name
-- another household's category (R17); it is NO ACTION, like the entries' key, so a group's delete
-- removes its budgets together with its categories.
CREATE TABLE budgets (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    category_id UUID NOT NULL,
    month DATE NOT NULL,
    amount BIGINT,
    currency TEXT,
    version INT4 DEFAULT 1 NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT budgets_category_fkey FOREIGN KEY (group_id, category_id)
        REFERENCES categories (group_id, id),
    CONSTRAINT budgets_group_category_month_key UNIQUE (group_id, category_id, month),
    CONSTRAINT budgets_month_check CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT budgets_amount_check CHECK (amount BETWEEN 1 AND 9007199254740991),
    CONSTRAINT budgets_currency_check CHECK ((amount IS NULL) = (currency IS NULL)),
    CONSTRAINT budgets_currency_code_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT budgets_version_check CHECK (version >= 1),
    CONSTRAINT budgets_change_sequence_check CHECK (change_sequence >= 1)
);

-- The month read takes each category's latest row through the unique key's prefix.
CREATE INDEX idx_budgets_group_change_sequence ON budgets (group_id, change_sequence);
CREATE INDEX idx_budgets_created_by ON budgets (created_by_user_id);
CREATE INDEX idx_budgets_updated_by ON budgets (updated_by_user_id);
