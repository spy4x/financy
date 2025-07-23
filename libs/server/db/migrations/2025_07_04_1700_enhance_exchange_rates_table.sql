-- Enhancement: Exchange Rates Table for Multi-Currency Support
-- This migration enhances the exchange_rates table to support proper foreign key relationships
-- and improved precision for currency conversions.

-- Step 1: Add new columns for foreign key relationships
ALTER TABLE exchange_rates 
ADD COLUMN from_currency_id INT4,
ADD COLUMN to_currency_id INT4,
ADD COLUMN date DATE DEFAULT CURRENT_DATE NOT NULL;

-- Step 2: Populate new columns from existing pair data
-- This assumes pairs are in format like 'USDEUR' (USD to EUR)
UPDATE exchange_rates SET
  from_currency_id = (
    SELECT id FROM currencies 
    WHERE code = LEFT(pair, 3)
  ),
  to_currency_id = (
    SELECT id FROM currencies 
    WHERE code = RIGHT(pair, 3)
  ),
  date = CURRENT_DATE
WHERE from_currency_id IS NULL;

-- Step 3: Make the new columns NOT NULL after population
ALTER TABLE exchange_rates 
ALTER COLUMN from_currency_id SET NOT NULL,
ALTER COLUMN to_currency_id SET NOT NULL;

-- Step 4: Add foreign key constraints
ALTER TABLE exchange_rates 
ADD CONSTRAINT fk_exchange_rates_from_currency 
  FOREIGN KEY (from_currency_id) REFERENCES currencies(id) ON DELETE CASCADE,
ADD CONSTRAINT fk_exchange_rates_to_currency 
  FOREIGN KEY (to_currency_id) REFERENCES currencies(id) ON DELETE CASCADE;

-- Step 5: Add unique constraint for the new structure
ALTER TABLE exchange_rates 
ADD CONSTRAINT unique_rate_per_day 
  UNIQUE (from_currency_id, to_currency_id, date);

-- Step 6: Update rate column to use NUMERIC for precision
ALTER TABLE exchange_rates 
ALTER COLUMN rate TYPE NUMERIC(18, 8);

-- Step 7: Create performance indexes
CREATE INDEX idx_exchange_rates_lookup 
ON exchange_rates (from_currency_id, to_currency_id, date DESC);

CREATE INDEX idx_exchange_rates_date 
ON exchange_rates (date DESC);

-- Step 8: Drop the old pair column (after data migration)
ALTER TABLE exchange_rates DROP COLUMN pair;

-- Add helpful comments
COMMENT ON COLUMN exchange_rates.from_currency_id IS 'Source currency for conversion (FK to currencies table)';
COMMENT ON COLUMN exchange_rates.to_currency_id IS 'Target currency for conversion (FK to currencies table)';
COMMENT ON COLUMN exchange_rates.date IS 'Date for which the exchange rate is valid (daily rates)';
COMMENT ON COLUMN exchange_rates.rate IS 'Exchange rate with high precision (18 digits, 8 decimal places)';
