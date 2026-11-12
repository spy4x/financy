-- Budget methods: how a household budgets from a month on (docs/aggregates.md). A row holds the
-- method from its month on, and a month's method is the latest row at or before it, so switching
-- in December never changes how October reads. A household with no row uses monthly limits.
-- `method` is the domain's BudgetMethod: 1 monthly limits, 2 envelopes. A switch writes the row
-- of the household's current month, so there is one row per household and month.
CREATE TABLE budget_methods (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    method SMALLINT NOT NULL,
    version INT4 DEFAULT 1 NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT budget_methods_group_month_key UNIQUE (group_id, month),
    CONSTRAINT budget_methods_month_check CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT budget_methods_method_check CHECK (method IN (1, 2)),
    CONSTRAINT budget_methods_version_check CHECK (version >= 1),
    CONSTRAINT budget_methods_change_sequence_check CHECK (change_sequence >= 1)
);

CREATE INDEX idx_budget_methods_group_change_sequence
    ON budget_methods (group_id, change_sequence);
CREATE INDEX idx_budget_methods_created_by ON budget_methods (created_by_user_id);
CREATE INDEX idx_budget_methods_updated_by ON budget_methods (updated_by_user_id);

-- Budget moves: money moved from one envelope to another in one month. The client makes the id,
-- so a retried move finds its row and moves nothing twice; a move is never edited or deleted, so
-- it has no version and no deleted_at. `amount` is the smallest unit of `currency`, the
-- household's main currency when the move was made, above zero and within
-- Number.MAX_SAFE_INTEGER. Both category keys include group_id, so a move can never name another
-- household's category (R17); they are NO ACTION, like the budgets' key, so a group's delete
-- removes its moves together with its categories.
CREATE TABLE budget_moves (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    from_category_id UUID NOT NULL,
    to_category_id UUID NOT NULL,
    amount BIGINT NOT NULL,
    currency TEXT NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT budget_moves_from_category_fkey FOREIGN KEY (group_id, from_category_id)
        REFERENCES categories (group_id, id),
    CONSTRAINT budget_moves_to_category_fkey FOREIGN KEY (group_id, to_category_id)
        REFERENCES categories (group_id, id),
    CONSTRAINT budget_moves_month_check CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT budget_moves_categories_check CHECK (from_category_id <> to_category_id),
    CONSTRAINT budget_moves_amount_check CHECK (amount BETWEEN 1 AND 9007199254740991),
    CONSTRAINT budget_moves_currency_code_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT budget_moves_change_sequence_check CHECK (change_sequence >= 1)
);

-- The envelope read sums a run of months' moves through this prefix.
CREATE INDEX idx_budget_moves_group_month ON budget_moves (group_id, month);
CREATE INDEX idx_budget_moves_group_change_sequence ON budget_moves (group_id, change_sequence);
CREATE INDEX idx_budget_moves_from_category ON budget_moves (group_id, from_category_id);
CREATE INDEX idx_budget_moves_to_category ON budget_moves (group_id, to_category_id);
CREATE INDEX idx_budget_moves_created_by ON budget_moves (created_by_user_id);
