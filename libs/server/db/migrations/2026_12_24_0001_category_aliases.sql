-- A category's aliases: the person's own words for it ("Lidl", "supermarket" for "Groceries"), which
-- the search palette matches as well as the name. Empty for every existing category. The domain
-- trims them, drops duplicates and keeps each to 60 characters (libs/domain/categories/+lib.ts);
-- the check keeps the count bounded even for a write that skips it.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}'
    CONSTRAINT categories_aliases_check CHECK (cardinality(aliases) <= 20);
