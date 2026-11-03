import type postgres from "postgres"
import { NOTE_RESTORE_DAYS } from "@domain/notes"

/** What one purge run did. */
export interface PurgeNotesResult {
  /** Notes removed for good. */
  removed: number
}

/**
 * Removes for good every note that was deleted more than {@link NOTE_RESTORE_DAYS} days before
 * `now`. Its audit rows stay: they hold no note body. A note deleted exactly on the boundary stays
 * until the next run.
 *
 * `now` is a parameter so a test sets the clock. The worker passes the current time.
 */
export async function purgeDeletedNotes(
  sql: postgres.Sql,
  now: Date = new Date(),
): Promise<PurgeNotesResult> {
  const removed = await sql`
    DELETE FROM notes
    WHERE deleted_at < ${now}::timestamptz - make_interval(days => ${NOTE_RESTORE_DAYS})
    RETURNING id
  `
  return { removed: removed.length }
}
