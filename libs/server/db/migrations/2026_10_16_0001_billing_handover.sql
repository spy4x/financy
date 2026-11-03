-- #250: a provider customer belongs to the owner who checked out. A transfer of ownership hands the
-- group's customer over: its id is recorded here for good, so the app never opens a portal for it
-- again, never lets one of its subscriptions take the group back, never changes what it is billed
-- for seats, and mails its notices to the owner who paid with it. The new owner checks out with a
-- customer of their own, so they never see the old owner's card, address or invoices.

CREATE TABLE billing_handed_over_customers (
    provider_customer_id VARCHAR(255) PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    -- The owner who paid with this customer; `NULL` once their account is deleted.
    previous_owner_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    handed_over_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- The customer each subscription bills, so a handed-over customer's subscription is known by its
-- own customer and not by the group's current one. Until now a group had one customer.
ALTER TABLE subscriptions ADD COLUMN provider_customer_id VARCHAR(255);

UPDATE subscriptions SET provider_customer_id = billing_customers.provider_customer_id
FROM billing_customers WHERE billing_customers.group_id = subscriptions.group_id;
