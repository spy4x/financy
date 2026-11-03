-- A persistent count of wrong one-time codes per user, with a lock that grows per failure
-- (#73). Kept on `user_totp`: only a user with an enrolment has a code to guess, and the row is
-- deleted with the enrolment.
--
-- `failed_attempts` counts checks that started, less the ones a correct code gave back.
-- `locked_until` is NULL, or the time before which no check may run. `last_failure_at` is when the
-- count last grew; after a long quiet spell the count starts again from 0. Existing rows start
-- with no failures.
ALTER TABLE user_totp
    ADD COLUMN failed_attempts INT4 DEFAULT 0 NOT NULL,
    ADD COLUMN locked_until TIMESTAMPTZ,
    ADD COLUMN last_failure_at TIMESTAMPTZ,
    ADD CONSTRAINT user_totp_failed_attempts_check CHECK (failed_attempts >= 0);
