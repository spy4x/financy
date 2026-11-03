-- Every group follows one set of rules (spy4x/template#129). The separate "personal" kind goes:
-- a person's first group, made at sign-up, is an ordinary group named "Personal", and the rule
-- "a person keeps at least one group" replaces the personal group's immunity from deletion.
--
-- Nothing is rewritten: a personal group already has its owner as a member with the owner role, so
-- once the kind column is gone it is an ordinary group. Every group row, membership, note, outbox
-- row and selection stays as it was. What is lost is the 1/2 marker only.
--
-- The partial unique index that allowed one active personal group per user depends on the column
-- and goes with it; it is dropped first, by name, so the intent is on record.
DROP INDEX idx_groups_one_active_personal_per_user;
DROP INDEX idx_groups_kind_created_id;
ALTER TABLE groups DROP CONSTRAINT groups_kind_check;
ALTER TABLE groups DROP COLUMN kind;

-- A soft-deleted group waits here for its owner to restore it, or for the worker to remove it
-- for good once its 30 days are over. Both look the deleted rows up by their deletion time.
CREATE INDEX idx_groups_deleted_at ON groups (deleted_at) WHERE deleted_at IS NOT NULL;
