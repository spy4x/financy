-- Update transaction table constraints for better data integrity
-- 1. Make category_id NOT NULL (transactions must have a category)
-- 2. Limit memo field to 500 characters max

-- First, update any existing transactions with NULL category_id to have a default category
-- We'll create a "Uncategorized" category for each group if needed
WITH default_categories AS (
  INSERT INTO categories (name, group_id, usage_count)
  SELECT 'Uncategorized', g.id, 0
  FROM groups g
  WHERE NOT EXISTS (
    SELECT 1 FROM categories c 
    WHERE c.group_id = g.id AND c.name = 'Uncategorized'
  )
  RETURNING id, group_id
),
updated_transactions AS (
  UPDATE transactions t
  SET category_id = dc.id
  FROM default_categories dc
  WHERE t.category_id IS NULL 
    AND t.group_id = dc.group_id
  RETURNING t.id
)
-- Update any remaining NULL category_id with existing "Uncategorized" categories
UPDATE transactions t
SET category_id = c.id
FROM categories c
WHERE t.category_id IS NULL 
  AND c.group_id = t.group_id 
  AND c.name = 'Uncategorized';

-- Now make category_id NOT NULL
ALTER TABLE transactions 
ALTER COLUMN category_id SET NOT NULL;

-- Update memo field constraint to max 500 characters
ALTER TABLE transactions 
ALTER COLUMN memo TYPE TEXT;

-- Add CHECK constraint for memo length
ALTER TABLE transactions 
ADD CONSTRAINT memo_length_check CHECK (LENGTH(memo) <= 500);

-- Add a comment to document the constraint
COMMENT ON COLUMN transactions.memo IS 'Additional notes (max 500 characters)';
