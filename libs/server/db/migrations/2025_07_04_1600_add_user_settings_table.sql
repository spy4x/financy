-- Add user_settings table to store user preferences
-- Includes theme preference and selected group for each user

CREATE TABLE user_settings (
    id INT4 PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme INT2 DEFAULT 3 NOT NULL,
    selected_group_id INT4 NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT user_settings_theme_check CHECK (theme >= 1 AND theme <= 3)
);

COMMENT ON COLUMN user_settings.id IS 'User ID - serves as both PK and FK to users table';
COMMENT ON COLUMN user_settings.theme IS '1=light, 2=dark, 3=system';
COMMENT ON COLUMN user_settings.selected_group_id IS 'Currently selected group for the user (FK to groups table)';

