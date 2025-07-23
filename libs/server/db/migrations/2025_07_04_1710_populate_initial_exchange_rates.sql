-- Initial Exchange Rates Population for Multi-Currency Support
-- This migration populates initial USD-based exchange rates for major currencies
-- These are sample rates and should be updated with real data from APIs

-- Get USD currency ID for reference
DO $$
DECLARE
    usd_id INTEGER;
BEGIN
    SELECT id INTO usd_id FROM currencies WHERE code = 'USD';
    
    -- Insert USD as base currency rates (USD to others)
    INSERT INTO exchange_rates (from_currency_id, to_currency_id, rate, date, fetched_at) VALUES
    -- Major fiat currencies
    (usd_id, (SELECT id FROM currencies WHERE code = 'EUR'), 0.85000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'GBP'), 0.73000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'JPY'), 110.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'CAD'), 1.25000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'AUD'), 1.35000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'CHF'), 0.92000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'CNY'), 6.45000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'SEK'), 8.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'NZD'), 1.42000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    
    -- Asian currencies
    (usd_id, (SELECT id FROM currencies WHERE code = 'SGD'), 1.35000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'HKD'), 7.80000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'KRW'), 1180.00000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'INR'), 74.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'THB'), 33.00000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    
    -- European currencies
    (usd_id, (SELECT id FROM currencies WHERE code = 'PLN'), 3.90000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'CZK'), 21.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'HUF'), 295.00000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'NOK'), 8.60000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'DKK'), 6.35000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    
    -- Americas
    (usd_id, (SELECT id FROM currencies WHERE code = 'BRL'), 5.20000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'MXN'), 20.00000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'ARS'), 98.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    
    -- Africa & Middle East
    (usd_id, (SELECT id FROM currencies WHERE code = 'ZAR'), 14.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'AED'), 3.67000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'SAR'), 3.75000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'ILS'), 3.25000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'TRY'), 8.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    
    -- Others
    (usd_id, (SELECT id FROM currencies WHERE code = 'RUB'), 73.50000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    
    -- Major cryptocurrencies (highly volatile, these are just examples)
    (usd_id, (SELECT id FROM currencies WHERE code = 'BTC'), 0.00002500, CURRENT_DATE, CURRENT_TIMESTAMP), -- ~$40,000 per BTC
    (usd_id, (SELECT id FROM currencies WHERE code = 'ETH'), 0.00040000, CURRENT_DATE, CURRENT_TIMESTAMP), -- ~$2,500 per ETH
    (usd_id, (SELECT id FROM currencies WHERE code = 'USDT'), 1.00000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    (usd_id, (SELECT id FROM currencies WHERE code = 'USDC'), 1.00000000, CURRENT_DATE, CURRENT_TIMESTAMP);
    
    -- Also insert reverse rates (others to USD) for common pairs
    INSERT INTO exchange_rates (from_currency_id, to_currency_id, rate, date, fetched_at) VALUES
    ((SELECT id FROM currencies WHERE code = 'EUR'), usd_id, 1.17647059, CURRENT_DATE, CURRENT_TIMESTAMP),
    ((SELECT id FROM currencies WHERE code = 'GBP'), usd_id, 1.36986301, CURRENT_DATE, CURRENT_TIMESTAMP),
    ((SELECT id FROM currencies WHERE code = 'JPY'), usd_id, 0.00904977, CURRENT_DATE, CURRENT_TIMESTAMP),
    ((SELECT id FROM currencies WHERE code = 'CAD'), usd_id, 0.80000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    ((SELECT id FROM currencies WHERE code = 'AUD'), usd_id, 0.74074074, CURRENT_DATE, CURRENT_TIMESTAMP),
    ((SELECT id FROM currencies WHERE code = 'BTC'), usd_id, 40000.00000000, CURRENT_DATE, CURRENT_TIMESTAMP),
    ((SELECT id FROM currencies WHERE code = 'ETH'), usd_id, 2500.00000000, CURRENT_DATE, CURRENT_TIMESTAMP);
    
END $$;
