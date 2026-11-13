import type postgres from "postgres"
import { type CoinPrice, COINS } from "@domain/money"

/** A stored coin price with the time it was fetched, for the admin's page. */
export interface StoredCoinPrice extends CoinPrice {
  fetchedAt: Date
}

/**
 * The listed coins (`COINS`) that an account holds, sorted. An archived account counts, a deleted
 * one or one of a deleted group does not.
 */
export async function coinsInUse(sql: postgres.Sql): Promise<string[]> {
  const rows = await sql<{ code: string }[]>`
    SELECT DISTINCT accounts.currency AS code
    FROM accounts
    INNER JOIN groups ON groups.id = accounts.group_id
    WHERE accounts.deleted_at IS NULL
      AND groups.deleted_at IS NULL
      AND accounts.currency IN ${sql(COINS.map((coin) => coin.code))}
    ORDER BY code
  `
  return rows.map((row) => row.code)
}

/** Every stored coin price, by coin. */
export async function readCoinPrices(sql: postgres.Sql): Promise<StoredCoinPrice[]> {
  return await sql<StoredCoinPrice[]>`
    SELECT coin, price::text AS price, to_char(price_date, 'YYYY-MM-DD') AS date, fetched_at
    FROM coin_prices
    ORDER BY coin
  `
}

/**
 * Stores `price` as its coin's only price, stamped `fetchedAt`. A stored price of a later date is
 * kept, so a late run never moves a price back in time.
 */
export async function storeCoinPrice(
  sql: postgres.Sql,
  price: CoinPrice,
  fetchedAt: Date,
): Promise<void> {
  await sql`
    INSERT INTO coin_prices (coin, price, price_date, fetched_at)
    VALUES (${price.coin}, ${price.price}::numeric, ${price.date}::date, ${fetchedAt})
    ON CONFLICT (coin) DO UPDATE
    SET price = EXCLUDED.price, price_date = EXCLUDED.price_date, fetched_at = EXCLUDED.fetched_at
    WHERE coin_prices.price_date <= EXCLUDED.price_date
  `
}

/** Deletes the price of every coin not in `keep`; an empty `keep` deletes them all. */
export async function deleteCoinPricesExcept(
  sql: postgres.Sql,
  keep: readonly string[],
): Promise<void> {
  await sql`DELETE FROM coin_prices WHERE NOT (coin = ANY(${sql.array([...keep])}::text[]))`
}
