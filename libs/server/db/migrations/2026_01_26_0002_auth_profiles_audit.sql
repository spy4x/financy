CREATE TABLE user_profiles (
    id SERIAL PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(50) NOT NULL,
    updated_by INT4 NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT user_profiles_display_name_check CHECK (length(display_name) >= 1)
);

CREATE UNIQUE INDEX idx_user_profiles_user_id ON user_profiles (user_id);
CREATE INDEX idx_user_profiles_updated_at ON user_profiles (updated_at DESC);

CREATE TABLE auth_audits (
    id SERIAL PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type INT2 NOT NULL,
    identifier VARCHAR(100),
    ip VARCHAR(45),
    user_agent VARCHAR(300),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT auth_audits_event_type_check CHECK (event_type = ANY (ARRAY[1, 2, 3, 4]))
);

CREATE INDEX idx_auth_audits_user_created_at ON auth_audits (user_id, created_at DESC);
CREATE INDEX idx_auth_audits_event_type ON auth_audits (event_type);
