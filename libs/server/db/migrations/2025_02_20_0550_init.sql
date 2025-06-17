CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    default_currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

COMMENT ON COLUMN groups.default_currency IS 'ISO 4217 Code (e.g., USD, EUR)';

CREATE INDEX idx_groups_sync_retrieval ON groups (updated_at DESC);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    role INT2 DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    mfa INT2 DEFAULT 1 NOT NULL,
    CONSTRAINT users_role_check CHECK ((role >= 0) AND (role <= 3)),
    CONSTRAINT users_check_mfa CHECK (mfa = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN users.role IS '0=viewer, 1=operator, 2=supervisor, 3=administrator';
COMMENT ON COLUMN users.mfa IS '1=not_configured, 2=confuration_not_finished, 3=configured';

CREATE TABLE user_keys (
    id SERIAL PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id),
    kind INT2 NOT NULL,
    identification VARCHAR(50) NOT NULL,
    secret VARCHAR(256),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_keys_check_kind CHECK (kind = ANY (ARRAY[0, 1, 2]))
);

COMMENT ON COLUMN user_keys.kind IS '0=login_password';

CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    token VARCHAR(256) NOT NULL,
    user_id INT4 NOT NULL REFERENCES users(id),
    key_id INT4 NOT NULL REFERENCES user_keys(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    mfa INT2 DEFAULT 1 NOT NULL,
    status INT2 DEFAULT 1 NOT NULL,
    CONSTRAINT user_sessions_check_mfa CHECK (mfa = ANY (ARRAY[1, 2, 3])),
    CONSTRAINT user_sessions_check_status CHECK (status = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN user_sessions.mfa IS '1=not_required, 2=not_passed_yet, 3=completed';
COMMENT ON COLUMN user_sessions.status IS '1=active, 2=expired, 3=signed_out';

CREATE TABLE user_push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT4 REFERENCES users(id),
    device_id VARCHAR(256) NOT NULL,
    endpoint VARCHAR(256) NOT NULL,
    auth VARCHAR(256) NOT NULL,
    p256dh VARCHAR(256) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    group_id INT4 REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    balance INT4 NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

COMMENT ON COLUMN accounts.currency IS 'Account currency ISO 4217';
COMMENT ON COLUMN accounts.balance IS 'Stored in smallest currency unit';

CREATE INDEX idx_accounts_sync_retrieval ON accounts (updated_at DESC);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    group_id INT4 REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    usage_count INT4 DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX idx_categories_by_group ON categories (group_id ASC);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    group_id INT4 REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
    account_id INT4 REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
    transaction_type INT2 NOT NULL,
    amount INT4 NOT NULL,
    original_currency VARCHAR(3),
    amount_original INT4,
    category_id INT4 REFERENCES categories(id),
    created_by INT4 REFERENCES users(id) NOT NULL,
    memo TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

COMMENT ON COLUMN transactions.transaction_type IS '0 = Expense, 1 = Income';
COMMENT ON COLUMN transactions.amount IS 'Stored in smallest unit';
COMMENT ON COLUMN transactions.original_currency IS 'Vendor''s currency (ISO 4217)';
COMMENT ON COLUMN transactions.amount_original IS 'Original amount in vendor''s currency';
COMMENT ON COLUMN transactions.category_id IS 'Transaction category';
COMMENT ON COLUMN transactions.memo IS 'Additional notes';

CREATE INDEX idx_transactions_sync_retrieval ON transactions (updated_at DESC);
CREATE INDEX idx_transactions_by_group ON transactions (group_id ASC);
CREATE INDEX idx_transactions_by_creator ON transactions (created_by);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE transactions_to_tags (
    transaction_id INT4 REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
    tag_id INT4 REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX idx_transactions_to_tags_by_tag ON transactions_to_tags (tag_id);
CREATE INDEX idx_transactions_to_tags_by_transaction ON transactions_to_tags (transaction_id);

CREATE TABLE exchange_rates (
    id SERIAL PRIMARY KEY,
    pair CHAR(6) NOT NULL UNIQUE,
    rate FLOAT8 NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

COMMENT ON COLUMN exchange_rates.pair IS 'Ex: USDUSD, USDEUR';

CREATE INDEX idx_exchange_rates_by_pair ON exchange_rates (pair);

CREATE TABLE group_memberships (
    id SERIAL PRIMARY KEY,
    group_id INT4 REFERENCES groups(id) ON DELETE CASCADE NOT NULL,
    user_id INT4 REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role INT2 NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

COMMENT ON COLUMN group_memberships.role IS 'Enum: 0 = Viewer, 1 = Editor, 2 = Admin, 3 = Owner';

CREATE INDEX idx_memberships_by_user_group ON group_memberships (user_id, group_id);
CREATE INDEX idx_memberships_by_group ON group_memberships (group_id);
