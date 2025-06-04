-- Rename column "added_at" to "created_at"
ALTER TABLE group_memberships
RENAME COLUMN added_at TO created_at;