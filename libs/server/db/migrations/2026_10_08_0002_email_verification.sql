-- Verify the e-mail address with a one-time code (spy4x/template#140).
--
-- Existing data is not touched. Proof of an address already lives in auth_keys.proven_at and
-- auth_email_owners; the codes live in auth_challenges, which stores only their hashes.

-- A new address the person asked to move to, kept until a code sent to it proves it. Until then
-- the account keeps signing in with its old address, and a password reset still goes there.
CREATE TABLE email_changes (
    user_id INT4 PRIMARY KEY REFERENCES auth_users (id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT email_changes_email_check CHECK (length(email) BETWEEN 3 AND 254)
);

-- One row per code mail the worker has not sent yet. A job in outbox_events carries no payload,
-- so the job points at this row by id. The worker makes the code and mails it in one step, so the
-- raw code is never stored, and deletes the row once it has handled it.
CREATE TABLE email_code_requests (
    id UUID PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT email_code_requests_email_check CHECK (length(email) BETWEEN 3 AND 254)
);

CREATE INDEX email_code_requests_user_id_idx ON email_code_requests (user_id);

-- The persistent count of wrong e-mail codes per user, with a lock that grows per failure
-- (@spy4x/server/lockout), on top of the guesses each code allows.
CREATE TABLE email_code_failures (
    user_id INT4 PRIMARY KEY REFERENCES auth_users (id) ON DELETE CASCADE,
    failed_attempts INT4 DEFAULT 0 NOT NULL,
    locked_until TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,
    CONSTRAINT email_code_failures_failed_attempts_check CHECK (failed_attempts >= 0)
);
