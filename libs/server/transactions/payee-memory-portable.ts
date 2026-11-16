import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError } from "@domain/groups"
import {
  parsePayeeMemoryExportEntry,
  type PayeeMemoryExportEntry,
  payeeMemoryExportProblems,
} from "@domain/transactions"
import { portable } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Rows one statement writes: well under Postgres's 65,535 parameters at seven columns a row. */
const WRITE_BATCH = 1_000

/**
 * Payee memory in a household's export file: each remembered payee key and the category last
 * chosen for it, named by its id in the same file. Never the member who chose it. On import each
 * gets a new id and names its category's new id, which the registry writes before it; one whose
 * category the file lacks refuses the whole import, as an entry's does.
 */
export const payeeMemoryPortable = portable<PayeeMemoryExportEntry>({
  kind: "payeeMemory",
  one: "remembered payee",
  other: "remembered payees",
  parse: parsePayeeMemoryExportEntry,
  check: payeeMemoryExportProblems,
  async *read(sql, groupId) {
    yield await sql<PayeeMemoryExportEntry[]>`
      SELECT id, payee_key, category_id, created_at, updated_at
      FROM payee_memory WHERE group_id = ${groupId}
      ORDER BY payee_key
    `
  },
  async write(sql, entries, context) {
    const ids = new Map<string, string>()
    const missing = entries.flatMap((entry, index) =>
      context.newIdOf("categories", entry.categoryId) === undefined ? [index] : []
    )
    if (missing.length > 0) {
      throw new GroupImportError(
        missing.slice(0, GROUP_IMPORT_PROBLEMS_MAX).map((index) => ({
          kind: "invalid",
          where: `Remembered payee ${index + 1}`,
          problem: `its category is not among the file's categories`,
          place: { part: "payeeMemory", index: index + 1 },
          issue: { code: "notFound", field: "categoryId" },
        })),
        missing.length,
      )
    }
    const rows = entries.map((entry) => {
      const id = uuidV7()
      ids.set(entry.id, id)
      return {
        id,
        group_id: context.groupId,
        payee_key: entry.payeeKey,
        category_id: context.newIdOf("categories", entry.categoryId)!,
        updated_by_user_id: context.actorId,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      }
    })
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await sql`INSERT INTO payee_memory ${sql(rows.slice(start, start + WRITE_BATCH))}`
    }
    return ids
  },
})
