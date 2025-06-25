-- Migration: Add category budget tracking
-- Description: Remove usage_count, add monthly_limit to categories, and create category_month_stats table
-- Created: 2025-06-25

-- Remove usage_count from categories and add monthly_limit
ALTER TABLE categories 
  DROP COLUMN usage_count,
  ADD COLUMN monthly_limit INT4;

COMMENT ON COLUMN categories.monthly_limit IS 'Default monthly spending limit in smallest currency unit';
