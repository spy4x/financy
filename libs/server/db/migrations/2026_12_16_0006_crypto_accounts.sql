-- Crypto accounts (kind 7): a crypto account holds a listed coin, and only a crypto account may.
-- The coin codes are COINS in libs/domain/money/+lib.ts; tests/coin-list.test.ts keeps the two
-- lists the same. Every other kind keeps an ISO 4217 code, which is three capital letters.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_kind_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_kind_check CHECK (kind BETWEEN 1 AND 7);
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_currency_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_currency_check CHECK (
    CASE WHEN kind = 7 THEN currency IN ('BTC', 'ETH')
    ELSE currency ~ '^[A-Z]{3}$' AND currency NOT IN ('BTC', 'ETH') END
);
