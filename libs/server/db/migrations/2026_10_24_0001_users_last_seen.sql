-- #152: when a person last did anything signed in, written at most every five minutes per person.
-- `NULL` until the first request after this migration; group admins read it on the members list.
ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMPTZ;
