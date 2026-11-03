import type postgres from "postgres"
import { BillingStatus } from "@domain/billing"
import { GROUP_RESTORE_DAYS } from "@domain/groups"

/** What one purge run did. */
export interface PurgeResult {
  /** Groups removed for good. */
  removed: number
  /** Expired groups kept because their subscription is not cancelled. */
  kept: number
}

/**
 * Removes for good every group that was deleted more than {@link GROUP_RESTORE_DAYS} days ago. The
 * database removes what hangs off a group with it (members, notes, outbox rows). Its audit rows
 * stay: the database empties their group id. A person's selection that pointed at the group is
 * emptied by the database.
 *
 * It uses the clock of the database, as the restore window does, so a group is never both
 * restorable and purged. A group deleted exactly on the boundary stays until the next run.
 *
 * A group whose subscription is not cancelled stays: a webhook can store one after the delete, and
 * purging it would drop the only record of a subscription the provider still charges. Such a group
 * is past its restore window, so the subscription is cancelled in the provider's dashboard; the
 * cancellation webhook marks it and the next run removes the group. The `DELETE` checks the
 * subscription again because it runs after the row locks are taken, so it sees a subscription that
 * a webhook committed while this run waited.
 */
export async function purgeDeletedGroups(sql: postgres.Sql): Promise<PurgeResult> {
  return await sql.begin(async (transaction) => {
    const due = await transaction<{ id: string }[]>`
      SELECT id
      FROM groups
      WHERE deleted_at < now() - make_interval(days => ${GROUP_RESTORE_DAYS})
      FOR UPDATE
    `
    if (due.length === 0) return { removed: 0, kept: 0 }
    const removed = await transaction`
      DELETE FROM groups
      WHERE id IN ${transaction(due.map((group) => group.id))}
        AND NOT EXISTS (
          SELECT 1 FROM subscriptions
          WHERE subscriptions.group_id = groups.id
            AND subscriptions.status <> ${BillingStatus.Canceled}
        )
      RETURNING id
    `
    return { removed: removed.length, kept: due.length - removed.length }
  })
}
