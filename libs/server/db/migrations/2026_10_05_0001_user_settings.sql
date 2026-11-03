-- Per-user settings, starting with the group the person works in now (the one `/notes` shows).
-- The server holds the only copy, so every device of the person agrees; a client may cache it.
--
-- `selected_group_id` is empty until the person first chooses or the server first picks. The row
-- may point at a group the person has since left or that was deleted: the reader checks
-- membership and falls back to another group, so no delete or leave path has to remember this
-- table. `version` grows by one with every change of the selection and is the sequence of the
-- hint that tells the person's other devices.
CREATE TABLE user_settings (
    user_id INT4 PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    selected_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    version INT4 DEFAULT 1 NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_settings_version_check CHECK (version >= 1)
);

-- Finds the rows to clear or re-read when a group goes away.
CREATE INDEX idx_user_settings_selected_group
    ON user_settings (selected_group_id)
    WHERE selected_group_id IS NOT NULL;
