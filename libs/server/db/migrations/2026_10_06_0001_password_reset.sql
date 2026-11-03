-- E-mail sign-up and password reset (spy4x/template#139).
--
-- Existing data is not touched. An address lives on the password key in auth_keys, where the auth
-- tables already keep one: sign-up writes it as the key's `subject` and `email`, normalised by
-- normalizeEmail. Every key written before this keeps its username as `subject`, `email` NULL, and
-- signs in as before.

-- One row per "forgot password" request the worker has not handled yet. A job in outbox_events
-- carries no payload, so the job points at this row by id. The row holds the address only: the
-- worker makes the reset code and mails it in one step, and only the code's hash is stored, in
-- auth_challenges. The worker deletes the row once it has handled it.
CREATE TABLE password_reset_requests (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT password_reset_requests_email_check CHECK (length(email) BETWEEN 3 AND 254)
);

-- Development only. With ENV=dev the worker writes every mail it sends here as well as to its log,
-- so an e2e spec can read a reset link through POST /api/test/last-mail, a route that exists only
-- in development. With ENV=prod nothing writes to this table.
CREATE TABLE dev_mail (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX dev_mail_to_address_idx ON dev_mail (to_address, id);
