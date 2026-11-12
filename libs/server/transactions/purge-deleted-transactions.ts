import type postgres from "postgres"
import { TRANSACTION_RESTORE_DAYS } from "@domain/transactions"

/** What one purge run did. */
export interface PurgeTransactionsResult {
  /** Entries removed for good. */
  removed: number
}

/**
 * Removes for good every entry deleted more than {@link TRANSACTION_RESTORE_DAYS} days before
 * `now`. An entry deleted exactly on the boundary stays until the next run. The worker runs it
 * before the accounts' purge, since an account's row cannot go while an entry names it.
 *
 * `now` is a parameter so a test sets the clock. The worker passes the current time.
 */
export async function purgeDeletedTransactions(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<PurgeTransactionsResult> {
  const removed = await sql`
    DELETE FROM transactions
    WHERE deleted_at < ${now}::timestamptz - make_interval(days => ${TRANSACTION_RESTORE_DAYS})
    RETURNING id
  `
  return { removed: removed.length }
}
