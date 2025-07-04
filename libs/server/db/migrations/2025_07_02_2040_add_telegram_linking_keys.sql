-- Migration: Add Telegram linking UserKeyKind values
-- Date: 2025-07-02
-- Description: Add new UserKeyKind enum values for Telegram account linking

-- Update the CHECK constraint to allow new values 5 and 6
ALTER TABLE user_keys DROP CONSTRAINT IF EXISTS user_keys_kind_check;
ALTER TABLE user_keys ADD CONSTRAINT user_keys_kind_check CHECK (kind = ANY (ARRAY[1, 2, 3, 4, 5, 6]));

-- Update the comment to reflect new enum values
COMMENT ON COLUMN user_keys.kind IS '1=login_password, 2=username_2fa_connecting, 3=username_2fa_completed, 4=telegram_auth, 5=telegram_linking_connecting, 6=telegram_linking_completed';
