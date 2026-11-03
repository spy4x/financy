-- #135: the audit rows become a readable activity log. An event now says what it was about, so a
-- page can write "Ada moved 3 notes to Family" and link to the note: the member it concerns (a role
-- change, a removal, a transfer), the entity (a note or an invitation) and a few facts (the old and
-- new name, the roles, how many notes). Rows written before this migration have none of them and
-- read as the bare kind. `actor_user_id` and `target_user_id` empty when that user is removed
-- for good, so a hard delete of an account never has to touch the log; the page reads such an
-- event as "Deleted user". `details` holds only short strings and numbers.
ALTER TABLE audit_events
    ALTER COLUMN actor_user_id DROP NOT NULL,
    DROP CONSTRAINT audit_events_actor_user_id_fkey,
    ADD CONSTRAINT audit_events_actor_user_id_fkey
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN target_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN entity_type VARCHAR(32),
    ADD COLUMN entity_id UUID,
    ADD COLUMN details JSONB DEFAULT '{}' NOT NULL;

-- The log's page: a group's events, newest first, paged by id.
CREATE INDEX idx_audit_events_group_id_desc ON audit_events (group_id, id DESC);
-- The retention job: events older than the retention period, across every group.
CREATE INDEX idx_audit_events_created ON audit_events (created_at);
