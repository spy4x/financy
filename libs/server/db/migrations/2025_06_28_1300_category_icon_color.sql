-- Add icon and color fields to categories for better visual organization
-- Icons can be emoji or icon names, colors for UI theming

-- Add icon column for emoji or icon identifier
ALTER TABLE categories ADD COLUMN icon VARCHAR(10);

-- Add color column for hex color codes (e.g., #FF5733)
ALTER TABLE categories ADD COLUMN color VARCHAR(7);

-- Add comments explaining the fields
COMMENT ON COLUMN categories.icon IS 'Emoji or icon identifier (max 10 chars)';
COMMENT ON COLUMN categories.color IS 'Hex color code (e.g., #FF5733)';
