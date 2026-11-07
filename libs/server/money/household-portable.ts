import { type HouseholdExportEntry, parseHouseholdExportEntry } from "@domain/money"
import { portable } from "@server/groups/portable.ts"

/**
 * A group's main currency in its export file, as one `household` entry. A group nobody saved one
 * for has no entry, and its import keeps the default. An entry is chosen when the household's
 * `chosen_at` is set, whoever saved it and whether their account still exists. An imported choice
 * stays a choice, saved by the importer and chosen at the import, so the first step stays ticked;
 * an unchosen entry stays unchosen.
 */
export const householdPortable = portable<HouseholdExportEntry>({
  kind: "household",
  one: "household setting",
  other: "household settings",
  parse: parseHouseholdExportEntry,
  check: (entries) =>
    entries.length > 1
      ? [{ index: null, problem: `the file holds ${entries.length} household settings, at most 1` }]
      : [],
  async *read(sql, groupId) {
    yield await sql<HouseholdExportEntry[]>`
      SELECT group_id AS id, base_currency, chosen_at IS NOT NULL AS chosen
      FROM household_settings WHERE group_id = ${groupId}
    `
  },
  async write(sql, entries, context) {
    const ids = new Map<string, string>()
    for (const entry of entries) {
      await sql`
        INSERT INTO household_settings (group_id, base_currency, updated_by_user_id, chosen_at)
        VALUES (
          ${context.groupId}, ${entry.baseCurrency}, ${entry.chosen ? context.actorId : null},
          CASE WHEN ${entry.chosen}::boolean THEN CURRENT_TIMESTAMP END
        )
      `
      ids.set(entry.id, context.groupId)
    }
    return ids
  },
})
