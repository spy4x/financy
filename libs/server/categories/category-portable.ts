import {
  type CategoryExportEntry,
  categoryExportProblems,
  CategoryKind,
  parentsFirst,
  parseCategoryExportEntry,
} from "@domain/categories"
import { portable } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Rows one statement writes: well under Postgres's 65,535 parameters at fourteen columns a row. */
const WRITE_BATCH = 1_000

/** The catalog key of each category kind's word. */
const KIND_WORDS: Record<CategoryKind, string> = {
  [CategoryKind.EXPENSE]: "CategoryParts.expense",
  [CategoryKind.INCOME]: "CategoryParts.income",
}

/** A row of `categories.csv`: what a person reads, in their words. */
interface CategorySpreadsheetRow {
  name: string
  kind: string
  parent: string | null
  archived: string
}

/**
 * Categories in a household's export file: what a person set (name, kind, icon, colour, aliases), where
 * each sits and whether it was archived. Never a person or a version. Each gets a new id on
 * import, and a child names its parent's new id. A file's categories fit one household: the tree
 * rules of a write, sibling names, and at most `CATEGORY_MAX_PER_GROUP` in use. They count against
 * the new household's `maxCategories`. In the spreadsheets, `categories.csv` names each parent by
 * its name, and lists a parent's subcategories right after it.
 */
export const categoryPortable = portable<CategoryExportEntry, CategorySpreadsheetRow>({
  kind: "categories",
  one: "category",
  other: "categories",
  limit: "maxCategories",
  parse: parseCategoryExportEntry,
  check: categoryExportProblems,
  async *read(sql, groupId) {
    yield await sql<CategoryExportEntry[]>`
      SELECT id, name, kind, icon, color, aliases, parent_id, archived_at IS NOT NULL AS archived,
        created_at, updated_at
      FROM categories WHERE group_id = ${groupId}
      ORDER BY kind, parent_id NULLS FIRST, lower(name), id
    `
  },
  csv: {
    columns: [
      { key: "name", header: "CategorySpreadsheet.name" },
      { key: "kind", header: "CategorySpreadsheet.kind" },
      { key: "parent", header: "CategorySpreadsheet.parent" },
      { key: "archived", header: "CategorySpreadsheet.archived" },
    ],
    async *read(sql, groupId, { t }) {
      const rows = await sql<
        { name: string; kind: CategoryKind; parent: string | null; archived: boolean }[]
      >`
        SELECT category.name, category.kind, parent.name AS parent,
          category.archived_at IS NOT NULL AS archived
        FROM categories category
        LEFT JOIN categories parent
          ON parent.id = category.parent_id AND parent.group_id = category.group_id
        WHERE category.group_id = ${groupId}
        ORDER BY category.kind, lower(COALESCE(parent.name, category.name)),
          category.parent_id NULLS FIRST, lower(category.name), category.id
      `
      yield rows.map((row) => ({
        name: row.name,
        kind: t(KIND_WORDS[row.kind]),
        parent: row.parent,
        archived: t(row.archived ? "GroupSpreadsheets.yes" : "GroupSpreadsheets.no"),
      }))
    },
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
      // A file exported before aliases existed has none.
      aliases: sql.array(category.aliases ?? []),
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
