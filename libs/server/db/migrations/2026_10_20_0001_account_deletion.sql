-- #144: a person deletes their own account. The request soft-deletes `users` at once (every group
-- query already hides a soft-deleted person) and waits 7 days in `account_deletions`; signing in
-- before `delete_after` removes the row and restores the account. A worker job then removes the
-- auth user for good, and the database removes or empties everything that pointed at it.
--
-- One row per user: a second request while one waits is refused by the unique key. The row hangs
-- off `auth_users`, so the hard delete takes it along with everything else.
CREATE TABLE account_deletions (
    id UUID PRIMARY KEY,
    user_id INT4 NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    delete_after TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_account_deletions_delete_after ON account_deletions (delete_after);

-- A sign-in that restores a waiting account queues a mail to the person (#144), so a sign-in by
-- someone else who knows the password does not go unnoticed. The mail job reads the row, sends the
-- mail and removes the row.
CREATE TABLE account_restorations (
    id UUID PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    restored_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX idx_account_restorations_user_id ON account_restorations (user_id);

-- What a deleted person wrote in a shared group stays there, by "Deleted user": the author
-- columns become nullable and are emptied when the user row goes. They were RESTRICT, which
-- made deleting a user who ever wrote anything impossible. The constraint names stay the same.
-- The migration runs in one transaction, so these tables stay locked against writes until it
-- commits, validation scans included. They are small; a large table would need its own
-- migration outside a transaction.
ALTER TABLE notes
    ALTER COLUMN created_by_user_id DROP NOT NULL,
    ALTER COLUMN updated_by_user_id DROP NOT NULL,
    DROP CONSTRAINT notes_created_by_user_id_fkey,
    DROP CONSTRAINT notes_updated_by_user_id_fkey,
    ADD CONSTRAINT notes_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID,
    ADD CONSTRAINT notes_updated_by_user_id_fkey
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE notes VALIDATE CONSTRAINT notes_created_by_user_id_fkey;
ALTER TABLE notes VALIDATE CONSTRAINT notes_updated_by_user_id_fkey;

ALTER TABLE groups
    ALTER COLUMN created_by_user_id DROP NOT NULL,
    DROP CONSTRAINT groups_created_by_user_id_fkey,
    ADD CONSTRAINT groups_created_by_user_id_fkey
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE groups VALIDATE CONSTRAINT groups_created_by_user_id_fkey;

ALTER TABLE group_members
    ALTER COLUMN added_by_user_id DROP NOT NULL,
    DROP CONSTRAINT group_members_added_by_user_id_fkey,
    ADD CONSTRAINT group_members_added_by_user_id_fkey
        FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE group_members VALIDATE CONSTRAINT group_members_added_by_user_id_fkey;

-- The delete for good empties or removes these rows by user: without an index each one scans
-- its whole table. `notes` already has its two.
CREATE INDEX idx_groups_created_by ON groups (created_by_user_id);
CREATE INDEX idx_group_members_added_by ON group_members (added_by_user_id);
CREATE INDEX idx_outbox_events_actor_user_id ON outbox_events (actor_user_id);

-- 5 = account deletion requested, 6 = account restored by signing in during the wait.
ALTER TABLE auth_audits
    DROP CONSTRAINT auth_audits_event_type_check,
    ADD CONSTRAINT auth_audits_event_type_check
        CHECK (event_type = ANY (ARRAY[1, 2, 3, 4, 5, 6])) NOT VALID;
ALTER TABLE auth_audits VALIDATE CONSTRAINT auth_audits_event_type_check;
