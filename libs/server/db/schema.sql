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
-- migrations, users, tags, exchange_rates → user_keys, user_push_tokens, groups
-- → user_sessions, group_memberships, accounts, categories → transactions
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
    role INT2 DEFAULT 1 NOT NULL CHECK (role >= 1 AND role <= 4),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    mfa INT2 DEFAULT 1 NOT NULL CHECK (mfa = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN users.role IS '1=viewer, 2=operator, 3=supervisor, 4=administrator';
COMMENT ON COLUMN users.mfa IS '1=not_configured, 2=confuration_not_finished, 3=configured';

CREATE TABLE user_keys (
    id SERIAL PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id),
    kind INT2 NOT NULL CHECK (kind = ANY (ARRAY[0, 1, 2])),
    identification VARCHAR(50) NOT NULL,
    secret VARCHAR(256),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON COLUMN user_keys.kind IS '1=login_password, 2=username_2fa_connecting, 3=username_2fa_completed';

CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    token VARCHAR(256) NOT NULL,
    user_id INT4 NOT NULL REFERENCES users(id),
    key_id INT4 NOT NULL REFERENCES user_keys(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    mfa INT2 DEFAULT 1 NOT NULL CHECK (mfa = ANY (ARRAY[1, 2, 3])),
    status INT2 DEFAULT 1 NOT NULL CHECK (status = ANY (ARRAY[1, 2, 3]))
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

-- -----------------------------------------------------------------------------
-- Independent tables
-- -----------------------------------------------------------------------------
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

CREATE INDEX idx_exchange_rates_by_pair ON exchange_rates (pair);

-- -----------------------------------------------------------------------------
-- Financial management tables
-- -----------------------------------------------------------------------------
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    default_currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN groups.default_currency IS 'ISO 4217 Code (e.g., USD, EUR)';

CREATE INDEX idx_groups_sync_retrieval ON groups (updated_at DESC);

CREATE TABLE group_memberships (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role INT2 NOT NULL CHECK ((role >= 1) AND (role <= 4)),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN group_memberships.role IS 'Enum: 1 = Viewer, 2 = Editor, 3 = Admin, 4 = Owner';

CREATE INDEX idx_memberships_by_user_group ON group_memberships (user_id, group_id);
CREATE INDEX idx_memberships_by_group ON group_memberships (group_id);

CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    balance INT4 DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN accounts.currency IS 'Account currency ISO 4217';
COMMENT ON COLUMN accounts.balance IS 'Stored in smallest currency unit';

CREATE INDEX idx_accounts_sync_retrieval ON accounts (updated_at DESC);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    monthly_limit INT4,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN categories.monthly_limit IS 'Default monthly spending limit in smallest currency unit';

CREATE INDEX idx_categories_by_group ON categories (group_id);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    account_id INT4 NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type INT2 NOT NULL CHECK ((type >= 1) AND (type <= 2)),
    amount INT4 NOT NULL,
    original_currency VARCHAR(3),
    original_amount INT4,
    category_id INT4 NOT NULL REFERENCES categories(id),
    created_by INT4 NOT NULL REFERENCES users(id),
    memo TEXT CHECK (LENGTH(memo) <= 500),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN transactions.type IS '1 = Debit, 2 = Credit';
COMMENT ON COLUMN transactions.amount IS 'Stored in smallest unit';
COMMENT ON COLUMN transactions.original_currency IS 'Vendor''s currency (ISO 4217)';
COMMENT ON COLUMN transactions.original_amount IS 'Original amount in vendor''s currency';
COMMENT ON COLUMN transactions.category_id IS 'Transaction category';
COMMENT ON COLUMN transactions.memo IS 'Additional notes (max 500 characters)';

CREATE INDEX idx_transactions_sync_retrieval ON transactions (updated_at DESC);
CREATE INDEX idx_transactions_by_group ON transactions (group_id);
CREATE INDEX idx_transactions_by_creator ON transactions (created_by);

CREATE TABLE transactions_to_tags (
    transaction_id INT4 NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id INT4 NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE INDEX idx_transactions_to_tags_by_tag ON transactions_to_tags (tag_id);
CREATE INDEX idx_transactions_to_tags_by_transaction ON transactions_to_tags (transaction_id);
