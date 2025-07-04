-- Standardize constraint format and add CASCADE DELETE everywhere
-- This migration:
-- 1. Converts all CHECK constraints to use "CONSTRAINT name CHECK" format
-- 2. Adds CASCADE DELETE to all foreign key references that don't have it
-- 3. Ensures consistency across the database schema

-- =============================================================================
-- Step 1: Standardize CHECK constraints to use "CONSTRAINT name CHECK" format
-- =============================================================================

-- Users table constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check_role;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_check_mfa;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_mfa_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role >= 1 AND role <= 4);
ALTER TABLE users ADD CONSTRAINT users_mfa_check CHECK (mfa = ANY (ARRAY[1, 2, 3]));

-- User_keys table constraints
ALTER TABLE user_keys DROP CONSTRAINT IF EXISTS user_keys_check_kind;
ALTER TABLE user_keys DROP CONSTRAINT IF EXISTS user_keys_kind_check;
ALTER TABLE user_keys ADD CONSTRAINT user_keys_kind_check CHECK (kind = ANY (ARRAY[1, 2, 3, 4, 5, 6]));

-- User_sessions table constraints  
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_check_mfa;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_mfa_check;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_check_status;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_status_check;
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_mfa_check CHECK (mfa = ANY (ARRAY[1, 2, 3]));
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_status_check CHECK (status = ANY (ARRAY[1, 2, 3]));

-- Currencies table constraints
ALTER TABLE currencies DROP CONSTRAINT IF EXISTS currencies_type_check;
ALTER TABLE currencies DROP CONSTRAINT IF EXISTS currencies_check_type;
ALTER TABLE currencies DROP CONSTRAINT IF EXISTS currencies_decimal_places_check;
ALTER TABLE currencies DROP CONSTRAINT IF EXISTS currencies_check_decimal_places;
ALTER TABLE currencies ADD CONSTRAINT currencies_type_check CHECK (type IN (1, 2));
ALTER TABLE currencies ADD CONSTRAINT currencies_decimal_places_check CHECK (decimal_places >= 0);

-- Group_memberships table constraints
ALTER TABLE group_memberships DROP CONSTRAINT IF EXISTS group_memberships_role_check;
ALTER TABLE group_memberships DROP CONSTRAINT IF EXISTS group_memberships_check_role;
ALTER TABLE group_memberships ADD CONSTRAINT group_memberships_role_check CHECK (role >= 1 AND role <= 4);

-- Categories table constraints
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_type_check;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_check_type;
ALTER TABLE categories ADD CONSTRAINT categories_type_check CHECK (type >= 1 AND type <= 2);

-- Transactions table constraints
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_check_type;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_memo_length_check;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_check_memo_length;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transfer_logic_check;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_transfer_logic_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK (type >= 1 AND type <= 3);
ALTER TABLE transactions ADD CONSTRAINT transactions_memo_length_check CHECK (LENGTH(memo) <= 500);
ALTER TABLE transactions ADD CONSTRAINT transfer_logic_check CHECK (
    (type = 3 AND category_id IS NULL) OR
    (type IN (1, 2) AND category_id IS NOT NULL)
);

-- =============================================================================
-- Step 2: Add CASCADE DELETE to foreign key references
-- =============================================================================

-- User_keys table - add CASCADE DELETE for user_id
ALTER TABLE user_keys DROP CONSTRAINT IF EXISTS user_keys_user_id_fkey;
ALTER TABLE user_keys ADD CONSTRAINT user_keys_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- User_sessions table - add CASCADE DELETE for user_id and key_id
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_key_id_fkey;
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_key_id_fkey 
    FOREIGN KEY (key_id) REFERENCES user_keys(id) ON DELETE CASCADE;

-- User_push_tokens table - add CASCADE DELETE for user_id
ALTER TABLE user_push_tokens DROP CONSTRAINT IF EXISTS user_push_tokens_user_id_fkey;
ALTER TABLE user_push_tokens ADD CONSTRAINT user_push_tokens_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Groups table - add CASCADE DELETE for currency_id
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_currency_id_fkey;
ALTER TABLE groups ADD CONSTRAINT groups_currency_id_fkey 
    FOREIGN KEY (currency_id) REFERENCES currencies(id) ON DELETE CASCADE;

-- Accounts table - add CASCADE DELETE for currency_id
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_currency_id_fkey;
ALTER TABLE accounts ADD CONSTRAINT accounts_currency_id_fkey 
    FOREIGN KEY (currency_id) REFERENCES currencies(id) ON DELETE CASCADE;

-- Categories table - ensure CASCADE DELETE for group_id (already exists, but verify)
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_group_id_fkey;
ALTER TABLE categories ADD CONSTRAINT categories_group_id_fkey 
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

-- Transactions table - add CASCADE DELETE for foreign keys that don't have it
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_original_currency_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_category_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_created_by_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_original_currency_id_fkey 
    FOREIGN KEY (original_currency_id) REFERENCES currencies(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_category_id_fkey 
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;


