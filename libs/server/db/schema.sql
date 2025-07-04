-- =============================================================================
-- Financy Database Schema
-- =============================================================================
-- This file represents the complete database schema for the Financy application.
-- It is generated from the current database state and serves as documentation.
-- 
-- To make changes, create new migration files in the migrations/ directory, then update this schema file.
-- 
-- Key Design Principles:
-- 1. Multi-tenancy: All financial data is scoped to groups via foreign keys
-- 2. Money Storage: All monetary values stored as integers (smallest currency unit)
-- 3. Soft Deletes: Most tables use deleted_at for soft deletion
-- 4. Audit Trail: All tables have created_at/updated_at timestamps
-- 5. Currency Support: Original currency/amount preserved for conversions
-- 6. Role-based Access: Group memberships define user permissions
-- 
-- Security Considerations:
-- - All queries must be scoped by user group membership
-- - User authentication via user_keys and user_sessions tables
-- - Role-based permissions enforced at application level
-- 
-- Performance Optimizations:
-- - Indexes on updated_at for sync operations
-- - Compound indexes for common query patterns
-- - Foreign key constraints for referential integrity
-- 
-- Table Dependencies (ordered from independent to dependent):
-- migrations, users, currencies, tags, exchange_rates → user_keys, user_push_tokens, groups
-- → user_sessions, group_memberships, user_settings, accounts, categories → transactions
-- → transactions_to_tags
-- 
-- 
-- PostgreSQL version: 16.9
-- Generated: 2025-06-17
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS plpgsql;

-- =============================================================================
-- TABLES (ordered by dependency)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Migration tracking table (independent)
-- -----------------------------------------------------------------------------
CREATE TABLE migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- -----------------------------------------------------------------------------
-- User management tables
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    role INT2 DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    mfa INT2 DEFAULT 1 NOT NULL,
    CONSTRAINT users_role_check CHECK (role >= 1 AND role <= 4),
    CONSTRAINT users_mfa_check CHECK (mfa = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN users.role IS '1=viewer, 2=operator, 3=supervisor, 4=administrator';
COMMENT ON COLUMN users.mfa IS '1=not_configured, 2=confuration_not_finished, 3=configured';

CREATE TABLE user_keys (
    id SERIAL PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind INT2 NOT NULL,
    identification VARCHAR(50) NOT NULL,
    secret VARCHAR(256),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_keys_kind_check CHECK (kind = ANY (ARRAY[1, 2, 3, 4, 5, 6]))
);

COMMENT ON COLUMN user_keys.kind IS '1=login_password, 2=username_2fa_connecting, 3=username_2fa_completed, 4=telegram_auth, 5=telegram_linking_connecting, 6=telegram_linking_completed';

CREATE INDEX idx_user_keys_by_user_id ON user_keys (user_id);
CREATE INDEX idx_user_keys_by_identification ON user_keys (identification);

CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    token VARCHAR(256) NOT NULL,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_id INT4 NOT NULL REFERENCES user_keys(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    mfa INT2 DEFAULT 1 NOT NULL,
    status INT2 DEFAULT 1 NOT NULL,
    CONSTRAINT user_sessions_mfa_check CHECK (mfa = ANY (ARRAY[1, 2, 3])),
    CONSTRAINT user_sessions_status_check CHECK (status = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN user_sessions.mfa IS '1=not_required, 2=not_passed_yet, 3=completed';
COMMENT ON COLUMN user_sessions.status IS '1=active, 2=expired, 3=signed_out';

CREATE INDEX idx_user_sessions_by_user_id ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_by_expires_at ON user_sessions (expires_at);

CREATE TABLE user_push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT4 REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(256) NOT NULL,
    endpoint VARCHAR(256) NOT NULL,
    auth VARCHAR(256) NOT NULL,
    p256dh VARCHAR(256) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_user_push_tokens_by_deleted_at ON user_push_tokens (deleted_at);
CREATE INDEX idx_user_push_tokens_by_user_id_deleted_at ON user_push_tokens (user_id, deleted_at);
CREATE INDEX idx_user_push_tokens_by_device_user ON user_push_tokens (device_id, user_id);

-- -----------------------------------------------------------------------------
-- Independent tables
-- -----------------------------------------------------------------------------
CREATE TABLE currencies (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    type INT2 NOT NULL,
    decimal_places INT2 NOT NULL DEFAULT 2,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT currencies_type_check CHECK (type IN (1, 2)),
    CONSTRAINT currencies_decimal_places_check CHECK (decimal_places >= 0)
);

COMMENT ON COLUMN currencies.code IS 'ISO 4217 currency code (e.g., USD, EUR, BTC)';
COMMENT ON COLUMN currencies.name IS 'Full currency name (e.g., US Dollar, Bitcoin)';
COMMENT ON COLUMN currencies.symbol IS 'Currency symbol (e.g., $, €, ₿)';
COMMENT ON COLUMN currencies.type IS '1=fiat, 2=crypto';
COMMENT ON COLUMN currencies.decimal_places IS 'Number of decimal places for display and calculations (e.g., JPY=0, USD=2, BHD=3, BTC=8)';

CREATE INDEX idx_currencies_by_code ON currencies (code);

CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE exchange_rates (
    id SERIAL PRIMARY KEY,
    pair CHAR(6) NOT NULL UNIQUE,
    rate FLOAT8 NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN exchange_rates.pair IS 'Ex: USDUSD, USDEUR';

-- -----------------------------------------------------------------------------
-- Financial management tables
-- -----------------------------------------------------------------------------
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    default_account_id INT4 REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN groups.currency_id IS 'Default currency for the group (FK to currencies table)';
COMMENT ON COLUMN groups.default_account_id IS 'Default account for new transactions in this group (FK to accounts table)';

CREATE INDEX idx_groups_sync_retrieval ON groups (updated_at DESC);

CREATE TABLE group_memberships (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role INT2 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT group_memberships_role_check CHECK (role >= 1 AND role <= 4)
);

COMMENT ON COLUMN group_memberships.role IS 'Enum: 1 = Viewer, 2 = Editor, 3 = Admin, 4 = Owner';

CREATE INDEX idx_memberships_by_user_group ON group_memberships (user_id, group_id);
CREATE INDEX idx_memberships_by_group ON group_memberships (group_id);

CREATE TABLE user_settings (
    id INT4 PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme INT2 DEFAULT 3 NOT NULL,
    selected_group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT user_settings_theme_check CHECK (theme >= 1 AND theme <= 3)
);

COMMENT ON COLUMN user_settings.id IS 'User ID - serves as both PK and FK to users table';
COMMENT ON COLUMN user_settings.theme IS '1=light, 2=dark, 3=system';
COMMENT ON COLUMN user_settings.selected_group_id IS 'Currently selected group for the user (FK to groups table)';

CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    starting_balance INT4 DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN accounts.currency_id IS 'Account currency (FK to currencies table)';
COMMENT ON COLUMN accounts.starting_balance IS 'Balance when user started using the app (editable), stored in smallest currency unit';

CREATE INDEX idx_accounts_sync_retrieval ON accounts (updated_at DESC);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type INT2 DEFAULT 1 NOT NULL,
    monthly_limit INT4,
    icon VARCHAR(10),
    color VARCHAR(7),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT categories_type_check CHECK (type >= 1 AND type <= 2)
);

COMMENT ON COLUMN categories.type IS '1=expense, 2=income';
COMMENT ON COLUMN categories.monthly_limit IS 'Default monthly spending limit in smallest currency unit';
COMMENT ON COLUMN categories.icon IS 'Emoji or icon identifier (max 10 chars)';
COMMENT ON COLUMN categories.color IS 'Hex color code (e.g., #FF5733)';

CREATE INDEX idx_categories_by_group ON categories (group_id);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    account_id INT4 NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    linked_transaction_code VARCHAR(10),
    direction INT2 NOT NULL,
    type INT2 NOT NULL,
    amount INT4 NOT NULL,
    original_currency_id INT4 REFERENCES currencies(id) ON DELETE CASCADE,
    original_amount INT4,
    category_id INT4 REFERENCES categories(id) ON DELETE CASCADE,
    created_by INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    memo TEXT,
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT transactions_type_check CHECK (type >= 1 AND type <= 3),
    CONSTRAINT transactions_memo_length_check CHECK (LENGTH(memo) <= 500),
    CONSTRAINT transfer_logic_check CHECK (
        (type = 3 AND category_id IS NULL) OR
        (type IN (1, 2) AND category_id IS NOT NULL)
    )
);

COMMENT ON COLUMN transactions.account_id IS 'Account for the transaction (single field approach)';
COMMENT ON COLUMN transactions.linked_transaction_code IS 'Random string linking transfer transaction pairs (e.g., "abc123xyz0")';
COMMENT ON COLUMN transactions.direction IS '1=MONEY_OUT, 2=MONEY_IN';
COMMENT ON COLUMN transactions.type IS '1=EXPENSE, 2=INCOME, 3=TRANSFER';
COMMENT ON COLUMN transactions.amount IS 'Stored in smallest unit';
COMMENT ON COLUMN transactions.original_currency_id IS 'Original currency from vendor (FK to currencies table), null if same as account currency';
COMMENT ON COLUMN transactions.original_amount IS 'Original amount in vendor''s currency';
COMMENT ON COLUMN transactions.category_id IS 'Transaction category (NULL for transfers)';
COMMENT ON COLUMN transactions.memo IS 'Additional notes (max 500 characters)';
COMMENT ON COLUMN transactions.timestamp IS 'User-editable transaction timestamp (when the transaction actually occurred)';

CREATE INDEX idx_transactions_sync_retrieval ON transactions (updated_at DESC);
CREATE INDEX idx_transactions_by_group ON transactions (group_id);
CREATE INDEX idx_transactions_by_account ON transactions (account_id);
CREATE INDEX idx_transactions_linked_transaction_code ON transactions(linked_transaction_code) WHERE linked_transaction_code IS NOT NULL;
CREATE INDEX idx_transactions_by_timestamp ON transactions (timestamp DESC);

CREATE TABLE transactions_to_tags (
    transaction_id INT4 NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id INT4 NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (transaction_id, tag_id)
);
