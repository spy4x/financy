CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    role INT2 DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_login_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    mfa INT2 DEFAULT 1 NOT NULL,
    CONSTRAINT users_role_check CHECK (role >= 1 AND role <= 4),
    CONSTRAINT users_mfa_check CHECK (mfa = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN users.role IS '1=viewer, 2=operator, 3=supervisor, 4=administrator';
COMMENT ON COLUMN users.mfa IS '1=not_configured, 2=confuration_not_finished, 3=configured';

CREATE TABLE user_keys (
    id SERIAL PRIMARY KEY,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind INT2 NOT NULL,
    identification VARCHAR(50) NOT NULL,
    secret VARCHAR(256),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_keys_kind_check CHECK (kind = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN user_keys.kind IS '1=login_password, 2=username_2fa_connecting, 3=username_2fa_completed';

CREATE INDEX idx_user_keys_by_user_id ON user_keys (user_id);
CREATE INDEX idx_user_keys_by_identification ON user_keys (identification);

CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    token VARCHAR(256) NOT NULL,
    user_id INT4 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_id INT4 NOT NULL REFERENCES user_keys(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    mfa INT2 DEFAULT 1 NOT NULL,
    status INT2 DEFAULT 1 NOT NULL,
    CONSTRAINT user_sessions_mfa_check CHECK (mfa = ANY (ARRAY[1, 2, 3])),
    CONSTRAINT user_sessions_status_check CHECK (status = ANY (ARRAY[1, 2, 3]))
);

COMMENT ON COLUMN user_sessions.mfa IS '1=not_required, 2=not_passed_yet, 3=completed';
COMMENT ON COLUMN user_sessions.status IS '1=active, 2=expired, 3=signed_out';

CREATE INDEX idx_user_sessions_by_user_id ON user_sessions (user_id);
CREATE INDEX idx_user_sessions_by_expires_at ON user_sessions (expires_at);

CREATE TABLE user_push_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT4 REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(256) NOT NULL,
    endpoint VARCHAR(256) NOT NULL,
    auth VARCHAR(256) NOT NULL,
    p256dh VARCHAR(256) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_user_push_tokens_by_deleted_at ON user_push_tokens (deleted_at);
CREATE INDEX idx_user_push_tokens_by_user_id_deleted_at ON user_push_tokens (user_id, deleted_at);
CREATE INDEX idx_user_push_tokens_by_device_user ON user_push_tokens (device_id, user_id);
