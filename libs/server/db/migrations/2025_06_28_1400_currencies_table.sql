-- Create currencies table for global currency management
-- This replaces the hardcoded currency constants with a database table

CREATE TABLE currencies (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    type INT2 NOT NULL CHECK (type IN (1, 2)),
    decimal_places INT2 NOT NULL DEFAULT 2 CHECK (decimal_places >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

COMMENT ON COLUMN currencies.code IS 'ISO 4217 currency code (e.g., USD, EUR, BTC)';
COMMENT ON COLUMN currencies.name IS 'Full currency name (e.g., US Dollar, Bitcoin)';
COMMENT ON COLUMN currencies.symbol IS 'Currency symbol (e.g., $, €, ₿)';
COMMENT ON COLUMN currencies.type IS '1=fiat, 2=crypto';
COMMENT ON COLUMN currencies.decimal_places IS 'Number of decimal places for display and calculations (e.g., JPY=0, USD=2, BHD=3, BTC=8)';

-- Create indexes for performance
CREATE INDEX idx_currencies_by_code ON currencies (code);
CREATE INDEX idx_currencies_by_type ON currencies (type);

-- Insert comprehensive currency data
INSERT INTO currencies (code, name, symbol, type, decimal_places) VALUES
-- Major Fiat Currencies
('USD', 'US Dollar', '$', 1, 2),
('EUR', 'Euro', '€', 1, 2),
('GBP', 'British Pound', '£', 1, 2),
('JPY', 'Japanese Yen', '¥', 1, 0),
('CAD', 'Canadian Dollar', 'C$', 1, 2),
('AUD', 'Australian Dollar', 'A$', 1, 2),
('CHF', 'Swiss Franc', 'Fr', 1, 2),
('CNY', 'Chinese Yuan', '¥', 1, 2),
('SEK', 'Swedish Krona', 'kr', 1, 2),
('NZD', 'New Zealand Dollar', 'NZ$', 1, 2),

-- Asian Currencies
('SGD', 'Singapore Dollar', 'S$', 1, 2),
('HKD', 'Hong Kong Dollar', 'HK$', 1, 2),
('KRW', 'South Korean Won', '₩', 1, 0),
('INR', 'Indian Rupee', '₹', 1, 2),
('THB', 'Thai Baht', '฿', 1, 2),
('MYR', 'Malaysian Ringgit', 'RM', 1, 2),
('PHP', 'Philippine Peso', '₱', 1, 2),
('IDR', 'Indonesian Rupiah', 'Rp', 1, 2),
('VND', 'Vietnamese Dong', '₫', 1, 0),
('TWD', 'Taiwan Dollar', 'NT$', 1, 2),
('PKR', 'Pakistani Rupee', '₨', 1, 2),
('LKR', 'Sri Lankan Rupee', 'Rs', 1, 2),
('BDT', 'Bangladeshi Taka', '৳', 1, 2),
('NPR', 'Nepalese Rupee', 'Rs', 1, 2),
('MMK', 'Myanmar Kyat', 'Ks', 1, 2),
('KHR', 'Cambodian Riel', '៛', 1, 2),
('LAK', 'Lao Kip', '₭', 1, 2),

-- European Currencies
('PLN', 'Polish Zloty', 'zł', 1, 2),
('CZK', 'Czech Koruna', 'Kč', 1, 2),
('HUF', 'Hungarian Forint', 'Ft', 1, 2),
('RON', 'Romanian Leu', 'lei', 1, 2),
('BGN', 'Bulgarian Lev', 'лв', 1, 2),
('HRK', 'Croatian Kuna', 'kn', 1, 2),
('DKK', 'Danish Krone', 'kr', 1, 2),
('NOK', 'Norwegian Krone', 'kr', 1, 2),
('ISK', 'Icelandic Krona', 'kr', 1, 2),
('RSD', 'Serbian Dinar', 'din', 1, 2),
('MKD', 'Macedonian Denar', 'ден', 1, 2),
('ALL', 'Albanian Lek', 'L', 1, 2),
('BAM', 'Bosnia-Herzegovina Convertible Mark', 'KM', 1, 2),

-- Americas
('BRL', 'Brazilian Real', 'R$', 1, 2),
('MXN', 'Mexican Peso', 'Mex$', 1, 2),
('ARS', 'Argentine Peso', '$', 1, 2),
('CLP', 'Chilean Peso', '$', 1, 0),
('COP', 'Colombian Peso', '$', 1, 2),
('PEN', 'Peruvian Sol', 'S/', 1, 2),
('UYU', 'Uruguayan Peso', '$', 1, 2),
('BOB', 'Bolivian Boliviano', 'Bs', 1, 2),
('PYG', 'Paraguayan Guarani', '₲', 1, 0),
('VES', 'Venezuelan Bolívar', 'Bs', 1, 2),
('GTQ', 'Guatemalan Quetzal', 'Q', 1, 2),
('CRC', 'Costa Rican Colón', '₡', 1, 2),
('PAB', 'Panamanian Balboa', 'B/.', 1, 2),
('HNL', 'Honduran Lempira', 'L', 1, 2),
('NIO', 'Nicaraguan Córdoba', 'C$', 1, 2),
('SVC', 'Salvadoran Colón', '₡', 1, 2),
('JMD', 'Jamaican Dollar', 'J$', 1, 2),
('TTD', 'Trinidad and Tobago Dollar', 'TT$', 1, 2),
('BBD', 'Barbados Dollar', 'Bds$', 1, 2),
('DOP', 'Dominican Peso', 'RD$', 1, 2),

-- Africa
('ZAR', 'South African Rand', 'R', 1, 2),
('NGN', 'Nigerian Naira', '₦', 1, 2),
('KES', 'Kenyan Shilling', 'KSh', 1, 2),
('GHS', 'Ghanaian Cedi', '₵', 1, 2),
('UGX', 'Ugandan Shilling', 'USh', 1, 0),
('TZS', 'Tanzanian Shilling', 'TSh', 1, 2),
('ETB', 'Ethiopian Birr', 'Br', 1, 2),
('MAD', 'Moroccan Dirham', 'MAD', 1, 2),
('EGP', 'Egyptian Pound', '£', 1, 2),
('AOA', 'Angolan Kwanza', 'Kz', 1, 2),
('MZN', 'Mozambican Metical', 'MT', 1, 2),
('ZMW', 'Zambian Kwacha', 'ZK', 1, 2),
('BWP', 'Botswana Pula', 'P', 1, 2),
('NAD', 'Namibian Dollar', 'N$', 1, 2),
('SZL', 'Eswatini Lilangeni', 'L', 1, 2),

-- Middle East
('AED', 'UAE Dirham', 'د.إ', 1, 2),
('SAR', 'Saudi Riyal', '﷼', 1, 2),
('ILS', 'Israeli Shekel', '₪', 1, 2),
('TRY', 'Turkish Lira', '₺', 1, 2),
('IRR', 'Iranian Rial', '﷼', 1, 2),
('IQD', 'Iraqi Dinar', 'ع.د', 1, 3),
('SYP', 'Syrian Pound', '£', 1, 2),
('LBP', 'Lebanese Pound', 'ل.ل', 1, 2),
('JOD', 'Jordanian Dinar', 'JD', 1, 3),
('KWD', 'Kuwaiti Dinar', 'KD', 1, 3),
('BHD', 'Bahraini Dinar', 'BD', 1, 3),
('QAR', 'Qatari Riyal', 'ر.ق', 1, 2),
('OMR', 'Omani Rial', 'ر.ع.', 1, 3),
('YER', 'Yemeni Rial', '﷼', 1, 2),

-- Others
('RUB', 'Russian Ruble', '₽', 1, 2),
('UAH', 'Ukrainian Hryvnia', '₴', 1, 2),
('BYN', 'Belarusian Ruble', 'Br', 1, 2),
('KZT', 'Kazakhstani Tenge', '₸', 1, 2),
('UZS', 'Uzbekistani Som', 'soʻm', 1, 2),
('GEL', 'Georgian Lari', '₾', 1, 2),
('AMD', 'Armenian Dram', '֏', 1, 2),
('AZN', 'Azerbaijani Manat', '₼', 1, 2),
('MDL', 'Moldovan Leu', 'L', 1, 2),

-- Pacific
('FJD', 'Fijian Dollar', 'FJ$', 1, 2),
('PGK', 'Papua New Guinea Kina', 'K', 1, 2),
('WST', 'Samoan Tala', 'WS$', 1, 2),
('TOP', 'Tongan Paʻanga', 'T$', 1, 2),
('VUV', 'Vanuatu Vatu', 'VT', 1, 0),

-- High precision currencies
('TND', 'Tunisian Dinar', 'د.ت', 1, 3),
('LYD', 'Libyan Dinar', 'ل.د', 1, 3),

-- Major Cryptocurrencies
('BTC', 'Bitcoin', '₿', 2, 8),
('ETH', 'Ethereum', 'Ξ', 2, 8),
('USDT', 'Tether', '₮', 2, 6),
('USDC', 'USD Coin', 'USDC', 2, 6),
('BNB', 'Binance Coin', 'BNB', 2, 8),
('ADA', 'Cardano', 'ADA', 2, 6),
('SOL', 'Solana', 'SOL', 2, 9),
('DOT', 'Polkadot', 'DOT', 2, 10),
('MATIC', 'Polygon', 'MATIC', 2, 8),
('AVAX', 'Avalanche', 'AVAX', 2, 8),
('DOGE', 'Dogecoin', 'DOGE', 2, 8),
('SHIB', 'Shiba Inu', 'SHIB', 2, 18),
('TRX', 'TRON', 'TRX', 2, 6),
('UNI', 'Uniswap', 'UNI', 2, 8),
('LINK', 'Chainlink', 'LINK', 2, 8),
('LTC', 'Litecoin', 'LTC', 2, 8),
('XRP', 'Ripple', 'XRP', 2, 6),
('XLM', 'Stellar', 'XLM', 2, 7),
('XMR', 'Monero', 'XMR', 2, 12),
('BCH', 'Bitcoin Cash', 'BCH', 2, 8);
