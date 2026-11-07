-- A household's main currency counts as chosen once `chosen_at` is set, the first time a person
-- saved it or an import carried a choice. It was read from `updated_by_user_id`, which turns null
-- when that person's account is deleted, so the household read as unchosen again. The backfill
-- takes every row a person saved; it only fills empty values, so a rerun changes nothing.
ALTER TABLE household_settings ADD COLUMN IF NOT EXISTS chosen_at TIMESTAMPTZ(3);
UPDATE household_settings SET chosen_at = updated_at
    WHERE chosen_at IS NULL AND updated_by_user_id IS NOT NULL;
