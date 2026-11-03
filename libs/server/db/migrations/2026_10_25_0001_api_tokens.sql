-- #167: personal API tokens. A person lets a script use the API in one of their groups. Only a
-- keyed SHA-256 of the token is kept (`token_hash`): the token itself is shown once and never
-- stored. `access` is 1 for read-only, 2 for read-write. `expires_at` is NULL for a token that
-- never expires. `last_used_at` is written at most every few minutes. Revoking deletes the row,
-- so the next request with the token is refused. The row goes with its owner and with its group.
CREATE TABLE api_tokens (
    id UUID PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    access INT2 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash),
    CONSTRAINT api_tokens_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 60),
    CONSTRAINT api_tokens_access_check CHECK (access IN (1, 2)),
    CONSTRAINT api_tokens_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

-- A person's list of tokens, newest first.
CREATE INDEX idx_api_tokens_user_id ON api_tokens (user_id, created_at DESC);
-- The cascade from a deleted group.
CREATE INDEX idx_api_tokens_group_id ON api_tokens (group_id);

-- 8 = a token was created, 9 = a token was used (at most every few minutes), 10 = a token was
-- revoked.
ALTER TABLE auth_audits
    DROP CONSTRAINT auth_audits_event_type_check,
    ADD CONSTRAINT auth_audits_event_type_check
        CHECK (event_type = ANY (ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) NOT VALID;
ALTER TABLE auth_audits VALIDATE CONSTRAINT auth_audits_event_type_check;
