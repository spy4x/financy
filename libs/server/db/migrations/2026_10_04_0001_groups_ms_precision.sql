-- The group list pages on `(updated_at, id)` and its cursor carries `updated_at` as a JavaScript
-- `Date`, which keeps milliseconds. With microseconds in the column, two groups changed in the same
-- millisecond could leave one out of the next page. Milliseconds in the column make the cursor
-- exact, as `notes` has had since it was created. Existing values are rounded to the millisecond,
-- which is harmless for a sort key and a creation time.
--
-- Changing a column's precision rewrites the whole table and its indexes while holding an
-- ACCESS EXCLUSIVE lock, so every read and write of `groups` waits until it finishes. The table is
-- small (one row per group), so the pause is short; a large table would need another way.
ALTER TABLE groups
    ALTER COLUMN created_at TYPE TIMESTAMPTZ(3),
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ(3);
