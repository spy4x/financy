-- #202: one subscription per group, paid through a provider (Stripe). The provider owns the money;
-- these tables keep what its webhooks report. A group with no row in `subscriptions` is on the free
-- plan.

-- The provider customer that pays for a group, kept so a second checkout or the portal reuses it.
CREATE TABLE billing_customers (
    group_id UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    provider_customer_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- One provider customer pays for one group: a later event found by its customer must name one group.
CREATE UNIQUE INDEX idx_billing_customers_provider_customer_id
    ON billing_customers (provider_customer_id);

-- A group's subscription as the newest applied event left it. `provider_event_at` and
-- `provider_event_rank` (1 created, 2 updated, 3 canceled) order the events: one that sorts before
-- them is older and changes nothing, so a late delivery never rolls the plan back.
CREATE TABLE subscriptions (
    group_id UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    provider_subscription_id VARCHAR(255) NOT NULL,
    plan_id VARCHAR(64),
    status INT2 NOT NULL,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE NOT NULL,
    provider_event_at TIMESTAMPTZ NOT NULL,
    provider_event_rank INT2 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK (status BETWEEN 1 AND 6),
    CONSTRAINT subscriptions_provider_event_rank_check CHECK (provider_event_rank BETWEEN 1 AND 3)
);

COMMENT ON COLUMN subscriptions.status IS
    '1=trialing, 2=active, 3=past_due, 4=canceled, 5=incomplete, 6=paused';

CREATE INDEX idx_subscriptions_provider_subscription_id
    ON subscriptions (provider_subscription_id);

-- Every webhook event already handled, by the provider's event id. It is written in the transaction
-- that applies the event, so a second delivery finds it and changes nothing.
CREATE TABLE billing_events (
    id VARCHAR(255) PRIMARY KEY,
    event_type INT2 NOT NULL,
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT billing_events_event_type_check CHECK (event_type BETWEEN 1 AND 5)
);
