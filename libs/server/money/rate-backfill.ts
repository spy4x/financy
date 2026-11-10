import type postgres from "postgres"
import { ECB_FIRST_DATE } from "@domain/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** An open request for past rates: the days from `fromDate` to `toDate`, both included. */
export interface RateBackfillRequest {
  id: string
  fromDate: string
  toDate: string
}

/** `date` (`YYYY-MM-DD`) moved by `days`. */
function shift(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/**
 * Asks for the rates before the oldest stored one, back to `date` (`YYYY-MM-DD`), and returns the
 * open request that covers them, or `null` when nothing is missing: `date` is not older than the
 * oldest stored rate, or no rate is stored yet (the daily job fills today first). Nothing before
 * the ECB's first day, 1999-01-04, is asked for.
 *
 * Open requests that overlap or touch the new days become one, so a hundred old transactions
 * imported at once leave one request. Two calls side by side take turns on an advisory lock.
 * #100 (import) calls this with the oldest date it imported. The hourly `rates.backfill` job
 * fills each request from the ECB and then deletes it (libs/server/jobs/exchange-rates.ts).
 */
export async function requestBackfillBefore(
  sql: postgres.Sql,
  date: string,
): Promise<RateBackfillRequest | null> {
  return await sql.begin(async (transaction: postgres.TransactionSql) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext('rate_backfill_requests'))`
    const [{ oldest }] = await transaction<{ oldest: string | null }[]>`
      SELECT to_char(min(rate_date), 'YYYY-MM-DD') AS oldest FROM exchange_rates
    `
    if (oldest === null) return null
    const fromDate = date < ECB_FIRST_DATE ? ECB_FIRST_DATE : date
    const toDate = shift(oldest, -1)
    if (fromDate > toDate) return null
    const touching = await transaction<RateBackfillRequest[]>`
      DELETE FROM rate_backfill_requests
      WHERE from_date <= ${shift(toDate, 1)}::date AND to_date >= ${shift(fromDate, -1)}::date
      RETURNING id, to_char(from_date, 'YYYY-MM-DD') AS from_date,
        to_char(to_date, 'YYYY-MM-DD') AS to_date
    `
    const merged = touching.reduce(
      (range, request) => ({
        fromDate: request.fromDate < range.fromDate ? request.fromDate : range.fromDate,
        toDate: request.toDate > range.toDate ? request.toDate : range.toDate,
      }),
      { fromDate, toDate },
    )
    const [request] = await transaction<RateBackfillRequest[]>`
      INSERT INTO rate_backfill_requests (id, from_date, to_date)
      VALUES (${uuidV7()}, ${merged.fromDate}::date, ${merged.toDate}::date)
      RETURNING id, to_char(from_date, 'YYYY-MM-DD') AS from_date,
        to_char(to_date, 'YYYY-MM-DD') AS to_date
    `
    return request
  })
}

/** Every open request for past rates, oldest first. */
export async function openBackfillRequests(sql: postgres.Sql): Promise<RateBackfillRequest[]> {
  return await sql<RateBackfillRequest[]>`
    SELECT id, to_char(from_date, 'YYYY-MM-DD') AS from_date, to_char(to_date, 'YYYY-MM-DD') AS to_date
    FROM rate_backfill_requests ORDER BY from_date
  `
}

/** Deletes the open request `id`. An id gone already (merged into a newer one) deletes nothing. */
export async function closeBackfillRequest(sql: postgres.Sql, id: string): Promise<void> {
  await sql`DELETE FROM rate_backfill_requests WHERE id = ${id}`
}
