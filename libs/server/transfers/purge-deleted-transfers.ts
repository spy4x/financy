import type postgres from "postgres"
import { TRANSFER_RESTORE_DAYS } from "@domain/transfers"

/** What one purge run did. */
export interface PurgeTransfersResult {
  /** Transfers removed for good. */
  removed: number
}

/**
 * Removes for good every transfer deleted more than {@link TRANSFER_RESTORE_DAYS} days before
 * `now`. A transfer deleted exactly on the boundary stays until the next run. The worker runs it
 * before the accounts' purge, since an account's row cannot go while a transfer names it.
 *
 * `now` is a parameter so a test sets the clock. The worker passes the current time.
 */
export async function purgeDeletedTransfers(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<PurgeTransfersResult> {
  const removed = await sql`
    DELETE FROM transfers
    WHERE deleted_at < ${now}::timestamptz - make_interval(days => ${TRANSFER_RESTORE_DAYS})
    RETURNING id
  `
  return { removed: removed.length }
}
