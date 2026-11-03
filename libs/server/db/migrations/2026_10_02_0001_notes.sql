-- Notes: the reference aggregate (docs/aggregates.md). A note belongs to one group and is read by
-- every member and written by an editor or above; the handlers check that, not the database.
--
-- `version` starts at 1 and grows by one with every write; an update or delete names the version
-- it saw and is refused when the note moved on. `change_sequence` is the group's change sequence
-- the note was last written at (groups.next_change_sequence, taken in the same transaction), so a
-- future pull can ask for the notes that changed after a cursor. A delete keeps the row with
-- `deleted_at` set, for the same reason.
--
-- The timestamps keep milliseconds, as a JavaScript Date does. The list cursor carries
-- `updated_at` as a Date, so a finer column would make the next page skip a note written in the
-- same millisecond as the last one shown.
CREATE TABLE notes (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    body TEXT DEFAULT '' NOT NULL,
    version INT4 DEFAULT 1 NOT NULL,
    change_sequence BIGINT NOT NULL,
    created_by_user_id INT4 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by_user_id INT4 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ(3),
    CONSTRAINT notes_title_check CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT notes_body_check CHECK (length(body) <= 10000),
    CONSTRAINT notes_version_check CHECK (version >= 1),
    CONSTRAINT notes_change_sequence_check CHECK (change_sequence >= 1)
);

-- The list: a group's live notes, newest first, paged by (updated_at, id).
CREATE INDEX idx_notes_group_updated_id_active
    ON notes (group_id, updated_at DESC, id)
    WHERE deleted_at IS NULL;
-- A future pull by cursor: a group's notes changed after a sequence, deleted ones included.
CREATE INDEX idx_notes_group_change_sequence ON notes (group_id, change_sequence);
CREATE INDEX idx_notes_created_by ON notes (created_by_user_id);
CREATE INDEX idx_notes_updated_by ON notes (updated_by_user_id);
