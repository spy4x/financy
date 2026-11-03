-- #204: a trial keeps its plan only until it ends, even when the provider's webhook for its end is
-- late. `trial_end` is the end the provider last reported; existing rows learn it from their next
-- event.

ALTER TABLE subscriptions ADD COLUMN trial_end TIMESTAMPTZ;
