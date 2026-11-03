-- #204: a past-due group keeps its plan only for a grace period. `past_due_since` is when the
-- provider first reported the subscription past due; a later past-due event keeps it, and any other
-- status clears it. A row already past due counts from its last event, the closest time stored.

ALTER TABLE subscriptions ADD COLUMN past_due_since TIMESTAMPTZ;

UPDATE subscriptions SET past_due_since = provider_event_at WHERE status = 3;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_past_due_since_check
    CHECK ((status = 3) = (past_due_since IS NOT NULL));
