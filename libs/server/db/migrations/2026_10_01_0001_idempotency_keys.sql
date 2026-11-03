-- One row per command a client sent with an idempotency key (ADR 002, "Idempotency"). A retry
-- with the same key returns `result` instead of running the command again.
--
-- `status` is 1 while the first run is in flight and 2 once its result is stored. `updated_at`
-- is when the row was claimed or finished; a claim that stays at 1 past its lease belongs to a
-- run that died, and the next retry takes it over. Rows older than seven days are removed by the
-- worker's sweep and are ignored by readers before that.
--
-- The key is scoped to the user, so one user cannot replay or block another user's key.
-- `request_hash` fingerprints the command's input: the same key with different input is refused
-- instead of answered with the first command's result.
CREATE TABLE idempotency_keys (
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(128) NOT NULL,
    command_name VARCHAR(100) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status INT2 NOT NULL,
    result JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (user_id, key),
    CONSTRAINT idempotency_keys_key_check CHECK (length(key) BETWEEN 1 AND 128),
    CONSTRAINT idempotency_keys_status_check CHECK (status = ANY (ARRAY[1, 2])),
    CONSTRAINT idempotency_keys_done_has_result_check CHECK (status = 1 OR result IS NOT NULL)
);

COMMENT ON COLUMN idempotency_keys.status IS '1=started, 2=done';

CREATE INDEX idx_idempotency_keys_created ON idempotency_keys (created_at);
