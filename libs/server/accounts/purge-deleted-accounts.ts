import type postgres from "postgres"
import { ACCOUNT_RESTORE_DAYS } from "@domain/accounts"

/** What one purge run did. */
export interface PurgeAccountsResult {
  /** Accounts removed for good. */
  removed: number
}

/**
 * Removes for good every account deleted more than {@link ACCOUNT_RESTORE_DAYS} days before `now`.
 * Its audit rows stay. An account deleted exactly on the boundary stays until the next run. Finance
 * rows that name an account will reference it with `ON DELETE RESTRICT`, so a purge can never remove
 * what a transaction names: such an account is refused deletion in the first place.
 *
 * `now` is a parameter so a test sets the clock. The worker passes the current time.
 */
export async function purgeDeletedAccounts(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<PurgeAccountsResult> {
  const removed = await sql`
    DELETE FROM accounts
    WHERE deleted_at < ${now}::timestamptz - make_interval(days => ${ACCOUNT_RESTORE_DAYS})
    RETURNING id
  `
  return { removed: removed.length }
}
