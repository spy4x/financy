-- Migration: Add exchange rate API usage tracking
-- Created: 2025-10-22
-- Description: Track API usage for rate limiting and monitoring

-- Table to track exchange rate API usage
CREATE TABLE exchange_rate_api_usage (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(100) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    success BOOLEAN NOT NULL,
    response_time_ms INT4,
    error_message TEXT,
    requests_remaining INT4,
    rate_limit_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_api_usage_provider_date ON exchange_rate_api_usage (provider, created_at DESC);
CREATE INDEX idx_api_usage_success ON exchange_rate_api_usage (success, created_at DESC);

-- Table to track manual rate overrides
CREATE TABLE exchange_rate_overrides (
    id SERIAL PRIMARY KEY,
    from_currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    to_currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    rate NUMERIC(18, 8) NOT NULL,
    reason TEXT NOT NULL,
    overridden_by INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    valid_from TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT check_valid_dates CHECK (valid_until IS NULL OR valid_until > valid_from)
);

COMMENT ON TABLE exchange_rate_overrides IS 'Manual exchange rate overrides set by admins for emergency situations';
COMMENT ON COLUMN exchange_rate_overrides.reason IS 'Reason for manual override (required for audit trail)';
COMMENT ON COLUMN exchange_rate_overrides.valid_from IS 'Start date/time for override validity';
COMMENT ON COLUMN exchange_rate_overrides.valid_until IS 'End date/time for override validity (NULL = indefinite)';

-- Indexes for override lookups
CREATE INDEX idx_rate_overrides_currencies ON exchange_rate_overrides (from_currency_id, to_currency_id, valid_from DESC);
CREATE INDEX idx_rate_overrides_validity ON exchange_rate_overrides (valid_from, valid_until) WHERE deleted_at IS NULL;

-- Table to track rate change alerts
CREATE TABLE exchange_rate_alerts (
    id SERIAL PRIMARY KEY,
    from_currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    to_currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    old_rate NUMERIC(18, 8) NOT NULL,
    new_rate NUMERIC(18, 8) NOT NULL,
    change_percent NUMERIC(10, 4) NOT NULL,
    alert_type INT2 NOT NULL,
    notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT exchange_rate_alerts_type_check CHECK (alert_type >= 1 AND alert_type <= 3)
);

COMMENT ON TABLE exchange_rate_alerts IS 'Tracks significant exchange rate changes for notifications';
COMMENT ON COLUMN exchange_rate_alerts.alert_type IS '1=minor_change (>2%), 2=significant_change (>5%), 3=major_change (>10%)';

-- Indexes for alert queries
CREATE INDEX idx_rate_alerts_notification ON exchange_rate_alerts (notified_at, created_at DESC);
CREATE INDEX idx_rate_alerts_currencies ON exchange_rate_alerts (from_currency_id, to_currency_id, created_at DESC);
