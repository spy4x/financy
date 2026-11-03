WITH missing_personal_groups AS (
    SELECT gen_random_uuid() AS id, users.id AS user_id
    FROM users
    WHERE users.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM groups
          WHERE groups.owner_user_id = users.id
            AND groups.kind = 1
            AND groups.deleted_at IS NULL
      )
), inserted_groups AS (
    INSERT INTO groups (id, kind, name, owner_user_id, created_by_user_id)
    SELECT id, 1, 'Personal', user_id, user_id
    FROM missing_personal_groups
    ON CONFLICT (owner_user_id) WHERE kind = 1 AND deleted_at IS NULL DO NOTHING
    RETURNING id, owner_user_id
)
INSERT INTO group_members (group_id, user_id, role, added_by_user_id)
SELECT id, owner_user_id, 4, owner_user_id
FROM inserted_groups
ON CONFLICT (group_id, user_id) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT users.id
        FROM users
        LEFT JOIN groups
          ON groups.owner_user_id = users.id
         AND groups.kind = 1
         AND groups.deleted_at IS NULL
        LEFT JOIN group_members
          ON group_members.group_id = groups.id
        WHERE users.deleted_at IS NULL
        GROUP BY users.id
        HAVING COUNT(DISTINCT groups.id) <> 1
            OR COUNT(group_members.user_id) <> 1
            OR COUNT(group_members.user_id) FILTER (
                WHERE group_members.user_id = users.id AND group_members.role = 4
            ) <> 1
    ) THEN
        RAISE EXCEPTION 'personal group backfill verification failed';
    END IF;
END;
$$;
