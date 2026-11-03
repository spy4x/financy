-- #247: only a subscription that has paid keeps its plan for the grace period of a failed payment.
-- `ever_active` turns true at the subscription's first active event and stays true while the same
-- subscription is held; a trial whose first charge fails never sets it, so it drops to Free at once.
-- A row already active counts as paid. A row already past due counts as paid too: the events that
-- would tell a failed trial from a failed renewal are not stored, and taking the grace from a paying
-- customer is the worse mistake.

ALTER TABLE subscriptions ADD COLUMN ever_active BOOLEAN DEFAULT FALSE NOT NULL;

UPDATE subscriptions SET ever_active = TRUE WHERE status IN (2, 3);
