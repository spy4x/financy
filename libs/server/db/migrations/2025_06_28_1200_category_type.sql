-- Add category type field to distinguish income from expense categories
-- This enables proper categorization of income vs expenses and improves budgeting logic

-- Add the type column with enum constraint
ALTER TABLE categories ADD COLUMN type INT2 DEFAULT 1 NOT NULL;

-- Add constraint to ensure valid type values (1=expense, 2=income)
ALTER TABLE categories ADD CONSTRAINT categories_type_check CHECK (type >= 1 AND type <= 2);

-- Add comment explaining the enum values
COMMENT ON COLUMN categories.type IS '1=expense, 2=income';

-- Update existing categories to be expense type (default behavior)
-- This maintains backward compatibility
UPDATE categories SET type = 1 WHERE type IS NULL;

-- Add index for efficient filtering by type
CREATE INDEX idx_categories_by_type ON categories (type);
