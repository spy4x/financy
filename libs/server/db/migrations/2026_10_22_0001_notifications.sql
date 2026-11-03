-- #147: the in-app inbox. One row is one thing the app tells a person: an invitation, a role
-- change, a removal, a group handed to them. The row is written in the transaction of the change it
-- tells about, so it exists exactly when the change does. `payload` holds the few facts the
-- sentence needs, never a note body or an address. `link` is the in-app page the notification is
-- about. A row of a deleted account goes with the account; a read row is deleted by the worker's
-- nightly cleanup 90 days after `read_at`.
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(64) NOT NULL,
    payload JSONB DEFAULT '{}' NOT NULL,
    link TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT notifications_kind_check CHECK (length(btrim(kind)) BETWEEN 1 AND 64),
    CONSTRAINT notifications_link_check CHECK (
        length(link) BETWEEN 1 AND 500
        AND link LIKE '/%'
        AND link NOT LIKE '//%'
        AND position('\' IN link) = 0
        AND link !~ '[[:space:][:cntrl:]]'
    )
);

-- A person's inbox: their notifications, newest first, paged by id.
CREATE INDEX idx_notifications_user_id_desc ON notifications (user_id, id DESC);
-- The bell's number: only unread rows, so it stays cheap in a long inbox.
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;
-- The retention job: read rows past their 90 days, across every user.
CREATE INDEX idx_notifications_read_at ON notifications (read_at) WHERE read_at IS NOT NULL;
