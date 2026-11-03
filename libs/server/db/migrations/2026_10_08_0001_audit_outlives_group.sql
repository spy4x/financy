-- #129: a group that is purged after its 30 days must leave its audit rows behind, as a record of
-- who created, renamed, deleted and restored it. The rows used to refuse to outlive the group
-- (ON DELETE RESTRICT); now the database empties their group id when the group goes.
ALTER TABLE audit_events ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE audit_events DROP CONSTRAINT audit_events_group_id_fkey;
ALTER TABLE audit_events
    ADD CONSTRAINT audit_events_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;
