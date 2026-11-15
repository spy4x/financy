import type postgres from "postgres"
import { RATE_SOURCES } from "@domain/money"
import recordedEcbRates from "../../../libs/server/money/fixtures/frankfurter-saturday-ecb.json" with {
  type: "json",
}

/**
 * The tables the nightly wipe keeps: what is real survives, the rest goes. Every other table in the
 * schema is emptied, a new one included, so a table added later needs no change here unless it
 * must survive the wipe (docs/demo.md). A kept table must not reference an emptied one:
 * `TRUNCATE ... CASCADE` would empty it too.
 */
export const KEPT_TABLES: readonly string[] = [
  // The schema's history, so the schema is not migrated again.
  `migrations`,
  // The server's last good backup (`infra/backup/backup.sh`): about the server, not the demo.
  `backup_status`,
  // The website's blog, its old addresses, earlier versions and where it was shared: real posts.
  `blog_posts`,
  `blog_slug_redirects`,
  `blog_post_revisions`,
  `blog_channels`,
  `blog_post_shares`,
  `blog_share_results`,
  // The website's real contact channels.
  `contact_links`,
  // The website's sign-up is real: its subscribers, the replay guard of those who left and the send
  // log. The seed replaces only its own fake rows, on domains reserved for examples.
  `subscribers`,
  `subscriber_unsubscribes`,
  `subscriber_sends`,
  // The stored files to delete: the wipe queues every attachment and picture here for the clean-up.
  `file_deletions`,
  // Rate history is shared public data the daily job fetched, not any household's. Only the demo's
  // sample rates in it are deleted, by {@link wipeDatabase}.
  `exchange_rates`,
  // The calls made to a paid rate source this month, so its monthly cap holds across wipes.
  `rate_source_calls`,
]

/**
 * The days the last seed before #271 could have written its sample rates under the ECB's label
 * (five working days before a nightly seed, deployed in November 2026).
 */
const LEGACY_SAMPLE_DAYS = { from: `2026-11-01`, until: `2026-12-01` } as const

/** How long the wipe waits for a lock before it gives up, instead of stalling the worker. */
const LOCK_TIMEOUT = `30s`

/**
 * Empties every table of the current schema except {@link KEPT_TABLES}, and deletes the demo's
 * sample rates from the kept rate history, in one transaction, and answers the tables it emptied.
 * Identities are not restarted: a new row never gets an id an old row had, so nothing cached
 * under an old id (the API caches users by id) can describe a new one.
 * Running it twice leaves the same empty tables.
 */
export async function wipeDatabase(sql: postgres.Sql): Promise<string[]> {
  return await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`)
    const rows = await tx<{ name: string }[]>`
      SELECT tablename AS name FROM pg_tables
      WHERE schemaname = current_schema() AND tablename NOT IN ${tx(KEPT_TABLES)}
      ORDER BY tablename
    `
    const names = rows.map((row) => row.name)
    // TRUNCATE fires no row trigger, so the attachments' objects, the profile pictures and their
    // processed widths are queued here, in the same transaction, for the clean-up to delete.
    await tx`
      INSERT INTO file_deletions (object_key) SELECT object_key FROM note_attachments
      ON CONFLICT DO NOTHING
    `
    await tx`
      INSERT INTO file_deletions (object_key)
      SELECT 'pictures/' || picture_id FROM users WHERE picture_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `
    await tx`
      INSERT INTO file_deletions (object_key)
      SELECT object_key FROM images UNION SELECT object_key FROM image_variants
      ON CONFLICT DO NOTHING
    `
    // The demo's sample rates go: the next seed writes them fresh for its own days, so the kept
    // history holds only real rates and the current sample days.
    await tx`DELETE FROM exchange_rates WHERE source = ${RATE_SOURCES.demo}`
    // Seeds before #271 stored the sample rates under the ECB's label, where the daily job's real
    // rate for the same day could never replace them. Until then every wipe emptied the rate
    // history, so those copies can only sit on the last old seed's days, in {@link
    // LEGACY_SAMPLE_DAYS}. Outside that window a real rate equal to a fixture value stays.
    const ecb = recordedEcbRates
    await tx`
      DELETE FROM exchange_rates AS stored
      USING unnest(
        ${tx.array(ecb.map((rate) => rate.base))}::text[],
        ${tx.array(ecb.map((rate) => rate.quote))}::text[],
        ${tx.array(ecb.map((rate) => String(rate.rate)))}::numeric[]
      ) AS fixture (base, quote, rate)
      WHERE stored.source = ${RATE_SOURCES.ecb}
        AND stored.base = fixture.base
        AND stored.quote = fixture.quote
        AND stored.rate = fixture.rate
        AND stored.rate_date <> ${recordedEcbRates[0].date}::date
        AND stored.rate_date >= ${LEGACY_SAMPLE_DAYS.from}::date
        AND stored.rate_date < ${LEGACY_SAMPLE_DAYS.until}::date
    `
    if (names.length > 0) {
      const quoted = names.map((name) => `"${name.replaceAll(`"`, `""`)}"`)
      await tx.unsafe(`TRUNCATE ${quoted.join(`, `)} CASCADE`)
    }
    return names
  })
}
