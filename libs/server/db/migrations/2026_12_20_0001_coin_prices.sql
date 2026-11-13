-- #191: today's price of each listed coin that an account holds, from CoinGecko.
--
-- One row per coin, upserted by the `rates.fetch` job, so there is never a history: CoinGecko's
-- terms ask for stored prices to be refreshed within 24 hours and deleted when access ends. The job
-- deletes every row once `RATES_COINGECKO_KEY` is removed, and the row of a coin no account holds.
-- `price` is one coin in euros (`NUMERIC`, so no float touches it), as of 00:00 UTC on
-- `price_date`. The coin codes are COINS in libs/domain/money/+lib.ts; the check takes any code of
-- the rates' shape, so a coin added to COINS needs no migration here.

CREATE TABLE coin_prices (
    coin VARCHAR(12) PRIMARY KEY,
    price NUMERIC NOT NULL,
    price_date DATE NOT NULL,
    fetched_at TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT coin_prices_coin_check CHECK (coin ~ '^[A-Z][A-Z0-9]{1,11}$'),
    CONSTRAINT coin_prices_price_check CHECK (price > 0)
);
