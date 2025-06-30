-- Add missing indexes for database queries based on actual usage patterns

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_by_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_by_expires_at ON user_sessions (expires_at);

-- User keys indexes  
CREATE INDEX IF NOT EXISTS idx_user_keys_by_user_id ON user_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_user_keys_by_identification ON user_keys (identification);

-- User push tokens indexes
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_by_deleted_at ON user_push_tokens (deleted_at);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_by_user_id_deleted_at ON user_push_tokens (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_by_device_user ON user_push_tokens (device_id, user_id);
