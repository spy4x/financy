import type postgres from "postgres"
import { RECURRING_RULE_RESTORE_DAYS } from "@domain/recurring"

/** What one purge run did. */
export interface PurgeRecurringRulesResult {
  /** Rules removed for good. */
  removed: number
}

/**
 * Removes for good every repeating rule deleted more than {@link RECURRING_RULE_RESTORE_DAYS} days
 * before `now`. A rule deleted exactly on the boundary stays until the next run. The worker runs it
 * before the accounts' purge, since an account's row cannot go while a rule names it.
 *
 * `now` is a parameter so a test sets the clock. The worker passes the current time.
 */
export async function purgeDeletedRecurringRules(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<PurgeRecurringRulesResult> {
  const removed = await sql`
    DELETE FROM recurring_rules
    WHERE deleted_at < ${now}::timestamptz - make_interval(days => ${RECURRING_RULE_RESTORE_DAYS})
    RETURNING id
  `
  return { removed: removed.length }
}
