-- #205: a per-member plan bills one seat per member. `quantity` is the seats the provider last
-- reported the subscription bills; the worker compares it with the member count and changes the
-- subscription when they differ. Existing rows start with an empty quantity, so the first nightly
-- run re-prices every live per-member subscription to its member count: Stripe prorates the change
-- on the next invoice, and the owner gets no notice of it.

ALTER TABLE subscriptions ADD COLUMN quantity INTEGER;
