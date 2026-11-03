-- One live push subscription per user and device.
--
-- `WebPushService.subscribe` now upserts on (user_id, device_id), which needs a unique index.
-- Rows that already break the rule keep only their most recently refreshed live row (latest
-- `updated_at`, ties by id): the older ones are marked deleted (soft delete, like every other
-- removal in this table), so nothing is lost.
UPDATE user_push_tokens
SET deleted_at = NOW(), updated_at = NOW()
WHERE deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT ON (user_id, device_id) id
    FROM user_push_tokens
    WHERE deleted_at IS NULL
    ORDER BY user_id, device_id, updated_at DESC, id DESC
  );

CREATE UNIQUE INDEX idx_user_push_tokens_live_by_user_device
  ON user_push_tokens (user_id, device_id)
  WHERE deleted_at IS NULL;
