import type postgres from "postgres"
import { AUDIT_RETENTION_DAYS } from "@domain/groups"

/**
 * Deletes every audit event older than `days` (a year by default, {@link AUDIT_RETENTION_DAYS}) and
 * returns how many. It runs in the worker's nightly cleanup, so a group's activity log holds the
 * last year and no more. The age is measured by the database's clock, as the other purges are, and
 * events of a group the worker already removed (their group id is empty) age out the same way.
 */
export async function purgeOldAuditEvents(
  sql: postgres.Sql,
  days: number = AUDIT_RETENTION_DAYS,
): Promise<number> {
  const removed = await sql`
    DELETE FROM audit_events WHERE created_at < now() - make_interval(days => ${days})
  `
  return removed.count
}
