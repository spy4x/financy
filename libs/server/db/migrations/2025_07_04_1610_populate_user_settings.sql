-- Populate user_settings for existing users
-- This migration creates default settings for users who existed before the user_settings table was added
-- Only insert for users who don't already have user_settings row

-- Select the first group each user is a member of as their default selected group
INSERT INTO user_settings (id, theme, selected_group_id, created_at, updated_at)
SELECT DISTINCT ON (u.id)
    u.id,
    3 as theme, -- Default to system theme
    gm.group_id,
    now() as created_at,
    now() as updated_at
FROM users u
JOIN group_memberships gm ON u.id = gm.user_id
LEFT JOIN user_settings us ON u.id = us.id
WHERE u.deleted_at IS NULL
  AND gm.deleted_at IS NULL
  AND us.id IS NULL -- Only for users without existing settings
ORDER BY u.id, gm.created_at ASC; -- Select the earliest group membership
