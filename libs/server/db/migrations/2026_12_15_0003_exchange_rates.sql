-- #93: a household's main currency and the daily exchange rates its totals convert through.
--
-- `exchange_rates` is reference data, not a household's: one row per base, quote, day and source,
-- written by the `rates.fetch` and `rates.backfill` jobs and never updated in place. A rate is one
-- `base` buying `rate` of `quote` (`NUMERIC`, so no float touches it). No rate is written here: the
-- jobs fetch them in every environment.
--
-- `rate_backfill_requests` holds the range of one `rates.backfill` job, whose id is the row's id: a
-- job row carries no payload. The ECB's series starts on 1999-01-04, so nothing earlier is asked.
--
-- `rate_source_calls` counts the calls made to a paid source per calendar month, so the fallback
-- stops at its monthly cap. A call is counted before it is made.
--
-- `household_settings` holds a group's main currency. A group without a row has the default, the
-- euro; `updated_by_user_id` is set once a person saved it, which ticks the first step.

CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY,
    base VARCHAR(12) NOT NULL,
    quote VARCHAR(12) NOT NULL,
    rate NUMERIC NOT NULL,
    rate_date DATE NOT NULL,
    source VARCHAR(40) NOT NULL,
    fetched_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT exchange_rates_base_check CHECK (base ~ '^[A-Z][A-Z0-9]{1,11}$'),
    CONSTRAINT exchange_rates_quote_check CHECK (quote ~ '^[A-Z][A-Z0-9]{1,11}$'),
    CONSTRAINT exchange_rates_pair_check CHECK (base <> quote),
    CONSTRAINT exchange_rates_rate_check CHECK (rate > 0),
    CONSTRAINT exchange_rates_source_check CHECK (length(btrim(source)) BETWEEN 1 AND 40),
    CONSTRAINT exchange_rates_unique UNIQUE (base, quote, rate_date, source)
);

CREATE INDEX idx_exchange_rates_lookup ON exchange_rates (base, quote, rate_date DESC);
CREATE INDEX idx_exchange_rates_date_source ON exchange_rates (rate_date, source);

CREATE TABLE rate_backfill_requests (
    id UUID PRIMARY KEY,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT rate_backfill_requests_from_check CHECK (from_date >= DATE '1999-01-04'),
    CONSTRAINT rate_backfill_requests_range_check CHECK (from_date <= to_date)
);

CREATE TABLE rate_source_calls (
    source VARCHAR(40) NOT NULL,
    month DATE NOT NULL,
    calls INT4 DEFAULT 0 NOT NULL,
    PRIMARY KEY (source, month),
    CONSTRAINT rate_source_calls_month_check CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT rate_source_calls_calls_check CHECK (calls >= 0)
);

CREATE TABLE household_settings (
    group_id UUID PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    base_currency VARCHAR(3) DEFAULT 'EUR' NOT NULL,
    version INT4 DEFAULT 1 NOT NULL,
    updated_by_user_id INT4 REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT household_settings_base_currency_check CHECK (base_currency ~ '^[A-Z]{3}$'),
    CONSTRAINT household_settings_version_check CHECK (version >= 1)
);

CREATE INDEX idx_household_settings_updated_by ON household_settings (updated_by_user_id);
CREATE INDEX idx_household_settings_base_currency ON household_settings (base_currency);
