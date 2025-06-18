-- Update enum values to start from 1 instead of 0 to avoid falsy issues
-- This migration updates:
-- 1. UserRole enum values (1=viewer, 2=operator, 3=supervisor, 4=admin)
-- 2. GroupRole enum values (1=viewer, 2=editor, 3=admin, 4=owner)  
-- 3. TransactionType enum values (1=debit, 2=credit)
-- 4. UserKeyKind enum values (1=username_password, 2=username_2fa_connecting, 3=username_2fa_completed)

-- Update users table role values
UPDATE users SET role = role + 1;
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK ((role >= 1) AND (role <= 4));
COMMENT ON COLUMN users.role IS '1=viewer, 2=operator, 3=supervisor, 4=administrator';

-- Update group_memberships table role values
UPDATE group_memberships SET role = role + 1;
ALTER TABLE group_memberships ADD CONSTRAINT group_memberships_role_check CHECK ((role >= 1) AND (role <= 4));
COMMENT ON COLUMN group_memberships.role IS 'Enum: 1 = Viewer, 2 = Editor, 3 = Admin, 4 = Owner';

-- Update transactions table type values (0=expense->1=debit, 1=income->2=credit)
UPDATE transactions SET type = CASE 
  WHEN type = 0 THEN 1  -- expense -> debit
  WHEN type = 1 THEN 2  -- income -> credit
  ELSE type
END;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK ((type >= 1) AND (type <= 2));
COMMENT ON COLUMN transactions.type IS '1 = Debit, 2 = Credit';

-- Update user_keys table kind values  
UPDATE user_keys SET kind = kind + 1;
COMMENT ON COLUMN user_keys.kind IS '1=login_password, 2=username_2fa_connecting, 3=username_2fa_completed';
