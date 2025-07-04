-- Add Telegram authentication support to user_keys table
-- Migration: 2025_07_02_1400_telegram_auth_support.sql

-- Update user_keys.kind enum to include Telegram authentication
COMMENT ON COLUMN user_keys.kind IS '1=login_password, 2=username_2fa_connecting, 3=username_2fa_completed, 4=telegram_auth';

-- Remove the old constraint and add the new one to include the new value
ALTER TABLE user_keys DROP CONSTRAINT IF EXISTS user_keys_check_kind;
ALTER TABLE user_keys DROP CONSTRAINT IF EXISTS user_keys_kind_check;
ALTER TABLE user_keys ADD CONSTRAINT user_keys_kind_check CHECK (kind = ANY (ARRAY[1, 2, 3, 4]));
