import {
  type CategoryExportEntry,
  categoryExportProblems,
  parentsFirst,
  parseCategoryExportEntry,
} from "@domain/categories"
import { portable } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Rows one statement writes: well under Postgres's 65,535 parameters at thirteen columns a row. */
const WRITE_BATCH = 1_000

/**
 * Categories in a household's export file: what a person set (name, kind, icon, colour), where
 * each sits and whether it was archived. Never a person or a version. Each gets a new id on
 * import, and a child names its parent's new id. A file's categories fit one household: the tree
 * rules of a write, sibling names, and at most `CATEGORY_MAX_PER_GROUP` in use. They count against
 * the new household's `maxCategories`.
 */
export const categoryPortable = portable<CategoryExportEntry>({
  kind: "categories",
  one: "category",
  other: "categories",
  limit: "maxCategories",
  parse: parseCategoryExportEntry,
  check: categoryExportProblems,
  async *read(sql, groupId) {
    yield await sql<CategoryExportEntry[]>`
      SELECT id, name, kind, icon, color, parent_id, archived_at IS NOT NULL AS archived,
        created_at, updated_at
      FROM categories WHERE group_id = ${groupId}
      ORDER BY kind, parent_id NULLS FIRST, lower(name), id
    `
  },
  async write(sql, entries, context) {
    const ids = new Map<string, string>()
    for (const category of entries) ids.set(category.id, uuidV7())
    // Parents first, so each statement's foreign key finds the parent a child names.
    const rows = parentsFirst(entries).map((category) => ({
      id: ids.get(category.id)!,
      group_id: context.groupId,
      parent_id: category.parentId === null ? null : ids.get(category.parentId)!,
      name: category.name,
      kind: category.kind,
      icon: category.icon,
      color: category.color,
      archived_at: category.archived ? category.updatedAt : null,
      change_sequence: context.changeSequence,
      created_by_user_id: context.actorId,
      updated_by_user_id: context.actorId,
      created_at: category.createdAt,
      updated_at: category.updatedAt,
    }))
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await sql`INSERT INTO categories ${sql(rows.slice(start, start + WRITE_BATCH))}`
    }
    return ids
  },
})
