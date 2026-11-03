-- Sign-in moves to the tables of @spy4x/server 1.0.0 (sign-in and auth packages).
--
-- What this does to existing data:
--   * Every `users` row is kept, with its profile, role, groups and audit history. An
--     `auth_users` row with the same id and the same created_at/deleted_at is created for it,
--     and `users.id` now references `auth_users (id)`.
--   * `user_keys` and `user_sessions` are dropped with all their rows. Every password hash and
--     every session is gone: each existing user is signed out and can no longer sign in to
--     that row. Signing up again creates a new user.
--   * Authenticator-app (TOTP) secrets lived in `user_keys` and are gone too, so every user's
--     `mfa` is reset to 1 (not configured).
--   * `auth_audits` and `user_push_tokens` keep their rows.

-- AUTH_POSTGRES_SCHEMA from jsr:@spy4x/server@1.0.0/auth/postgres, copied verbatim. A migration
-- is static SQL, so the text is repeated here; tests/integration/auth.integration.test.ts fails
-- when it no longer matches the package. Do not edit this block by hand.
CREATE TABLE auth_users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- One row per proven address: the user who owns it. The primary key is the one-owner rule.
CREATE TABLE auth_email_owners (
  email text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  CONSTRAINT auth_email_owners_email_user_key UNIQUE (email, user_id)
);

CREATE INDEX auth_email_owners_user_id_idx ON auth_email_owners (user_id);

CREATE TABLE auth_keys (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  method text NOT NULL,
  subject text NOT NULL,
  email text,
  secret text,
  proven_at timestamptz,
  -- The address, only while the key is proven. Referenced below, so a proven key's address is
  -- always owned by the key's own user.
  proven_email text GENERATED ALWAYS AS (CASE WHEN proven_at IS NULL THEN NULL ELSE email END) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_keys_method_subject_key UNIQUE (method, subject),
  CONSTRAINT auth_keys_id_user_key UNIQUE (id, user_id),
  CONSTRAINT auth_keys_proven_email_owner_fkey FOREIGN KEY (proven_email, user_id)
    REFERENCES auth_email_owners (email, user_id),
  CONSTRAINT auth_keys_method_check CHECK (length(method) BETWEEN 1 AND 64),
  CONSTRAINT auth_keys_subject_check CHECK (length(subject) BETWEEN 1 AND 255),
  CONSTRAINT auth_keys_email_check CHECK (email = lower(btrim(email)) AND length(email) <= 254),
  CONSTRAINT auth_keys_secret_check CHECK (length(secret) BETWEEN 1 AND 1024),
  CONSTRAINT auth_keys_proven_email_check CHECK (proven_at IS NULL OR email IS NOT NULL)
);

CREATE INDEX auth_keys_user_id_idx ON auth_keys (user_id);
CREATE INDEX auth_keys_email_idx ON auth_keys (email) WHERE email IS NOT NULL;

-- Status: 1 = active, 2 = expired, 3 = signed out. Second factor: 1 = not required, 2 = pending,
-- 3 = completed. The values of SessionStatus and SecondFactorStatus in @spy4x/server/sign-in.
CREATE TABLE auth_sessions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer NOT NULL,
  key_id integer NOT NULL,
  token_hash text NOT NULL,
  status smallint NOT NULL,
  second_factor smallint NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_key_fkey FOREIGN KEY (key_id, user_id)
    REFERENCES auth_keys (id, user_id) ON DELETE CASCADE,
  CONSTRAINT auth_sessions_status_check CHECK (status IN (1, 2, 3)),
  CONSTRAINT auth_sessions_second_factor_check CHECK (second_factor IN (1, 2, 3))
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_key_id_idx ON auth_sessions (key_id);
CREATE INDEX auth_sessions_active_expires_at_idx ON auth_sessions (expires_at) WHERE status = 1;

-- Guess-counted challenges. Expired rows are harmless and may be deleted at any time:
-- DELETE FROM auth_challenges WHERE expires_at <= now()
CREATE TABLE auth_challenges (
  purpose text NOT NULL,
  subject text NOT NULL,
  secret_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (purpose, subject),
  CONSTRAINT auth_challenges_purpose_check CHECK (length(purpose) BETWEEN 1 AND 64),
  CONSTRAINT auth_challenges_subject_check CHECK (length(subject) BETWEEN 1 AND 255),
  CONSTRAINT auth_challenges_secret_hash_check CHECK (length(secret_hash) BETWEEN 1 AND 1024),
  CONSTRAINT auth_challenges_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX auth_challenges_expires_at_idx ON auth_challenges (expires_at);
-- End of AUTH_POSTGRES_SCHEMA.

INSERT INTO auth_users (id, created_at, deleted_at) OVERRIDING SYSTEM VALUE
SELECT id, created_at, deleted_at FROM users;

-- The next auth user id continues after the highest copied one (or starts at 1).
SELECT setval(pg_get_serial_sequence('auth_users', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL)
FROM auth_users;

-- A profile row is created with the id of its auth user, never from a sequence of its own.
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE users_id_seq;
ALTER TABLE users
    ADD CONSTRAINT users_id_auth_users_fkey FOREIGN KEY (id) REFERENCES auth_users (id)
    ON DELETE CASCADE;

DROP TABLE user_sessions;
DROP TABLE user_keys;

UPDATE users SET mfa = 1, updated_at = CURRENT_TIMESTAMP WHERE mfa <> 1;

-- The authenticator-app secret of a user. `confirmed_at` is NULL while enrolment is not finished.
-- `last_accepted_step` is the TOTP time step of the last accepted code, so a code is never
-- accepted twice.
CREATE TABLE user_totp (
    user_id INT4 PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ,
    last_accepted_step INT4,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_totp_secret_check CHECK (length(secret) BETWEEN 1 AND 256),
    CONSTRAINT user_totp_last_accepted_step_check CHECK (last_accepted_step >= 0)
);
