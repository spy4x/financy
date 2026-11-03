-- #164: restoring deleted notes. The "Show deleted" list pages a group's deleted notes the way the
-- live list pages its live ones, and the worker's nightly purge finds notes deleted long ago.
CREATE INDEX idx_notes_group_updated_id_deleted
    ON notes (group_id, updated_at DESC, id)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_notes_deleted_at ON notes (deleted_at) WHERE deleted_at IS NOT NULL;
