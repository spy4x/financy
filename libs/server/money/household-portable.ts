import { type HouseholdExportEntry, parseHouseholdExportEntry } from "@domain/money"
import { portable } from "@server/groups/portable.ts"

/**
 * A group's main currency in its export file, as one `household` entry. A group nobody saved one
 * for has no entry, and its import keeps the default. An imported choice stays a choice, made by
 * the importer, so the first step stays ticked.
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
      SELECT group_id AS id, base_currency, updated_by_user_id IS NOT NULL AS chosen
      FROM household_settings WHERE group_id = ${groupId}
    `
  },
  async write(sql, entries, context) {
    const ids = new Map<string, string>()
    for (const entry of entries) {
      await sql`
        INSERT INTO household_settings (group_id, base_currency, updated_by_user_id)
        VALUES (${context.groupId}, ${entry.baseCurrency}, ${entry.chosen ? context.actorId : null})
      `
      ids.set(entry.id, context.groupId)
    }
    return ids
  },
})
