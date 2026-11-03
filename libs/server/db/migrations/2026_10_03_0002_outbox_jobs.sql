-- A delayed or repeating job is an outbox row that belongs to no group and no user: a nightly
-- cleanup has neither. Both columns become optional, and a CHECK keeps them in step so a group
-- change always names its group and its actor.
ALTER TABLE outbox_events
    ALTER COLUMN group_id DROP NOT NULL,
    ALTER COLUMN actor_user_id DROP NOT NULL,
    ADD CONSTRAINT outbox_events_group_actor_check CHECK ((group_id IS NULL) = (actor_user_id IS NULL));
