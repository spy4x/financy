-- An account's aliases: the person's own words for it ("card", "наличка" for "Cash"), which the
-- search palette matches as well as the name. Empty for every existing account. The domain trims
-- them, drops duplicates and keeps each to 60 characters (libs/domain/accounts/+lib.ts and
-- libs/domain/aliases/+lib.ts); the check keeps the count bounded even for a write that skips it.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}'
    CONSTRAINT accounts_aliases_check CHECK (cardinality(aliases) <= 20);
