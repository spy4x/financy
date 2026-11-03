-- The idempotency store of spy4x/ts-libs fences each claim with a token: `complete` and `release`
-- change a row only while they hold the token that claimed it, so a run whose claim was taken over
-- after its lease ran out can no longer overwrite the new run's result.
--
-- The default stays. `migrate` runs while the previous API still serves traffic, and its INSERT
-- does not name this column, so without a default every keyed command would fail until the new API
-- is up. The new store always writes its own token; the default only serves the old process, and
-- rows that exist already get a random token.
ALTER TABLE idempotency_keys ADD COLUMN claim_token UUID NOT NULL DEFAULT gen_random_uuid();
