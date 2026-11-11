/**
 * The operator area's read over categories: counts per kind and per household. No category name,
 * icon or colour leaves here: a name says something personal about a household (product.md §5).
 * Reads no environment and imports no singleton.
 *
 * @module
 */

import type postgres from "postgres"
import {
  ADMIN_CATEGORIES_HOUSEHOLD_LIMIT,
  type AdminCategoriesOverview,
  CATEGORY_KINDS,
  type CategoryKind,
} from "@domain/categories"

/** Counts every household's categories as {@link AdminCategoriesOverview}. */
export async function readAdminCategories(sql: postgres.Sql): Promise<AdminCategoriesOverview> {
  const [[totals], kinds, households] = await Promise.all([
    sql<Omit<AdminCategoriesOverview, "byKind" | "topHouseholds">[]>`
      SELECT
        COUNT(*) FILTER (WHERE archived_at IS NULL)::int AS categories,
        COUNT(*) FILTER (WHERE archived_at IS NOT NULL)::int AS archived,
        COUNT(*) FILTER (WHERE archived_at IS NULL AND parent_id IS NOT NULL)::int AS subcategories,
        COUNT(DISTINCT group_id)::int AS households
      FROM categories
    `,
    sql<{ kind: CategoryKind; categories: number }[]>`
      SELECT kind, COUNT(*)::int AS categories FROM categories
      WHERE archived_at IS NULL GROUP BY kind
    `,
    sql<AdminCategoriesOverview["topHouseholds"]>`
      SELECT g.id AS group_id, g.name AS group_name, COUNT(*)::int AS categories
      FROM categories c JOIN groups g ON g.id = c.group_id
      WHERE c.archived_at IS NULL
      GROUP BY g.id, g.name
      ORDER BY categories DESC, g.id
      LIMIT ${ADMIN_CATEGORIES_HOUSEHOLD_LIMIT}
    `,
  ])
  const byKind = new Map(kinds.map((row) => [row.kind, row.categories]))
  return {
    ...totals,
    byKind: CATEGORY_KINDS.filter((kind) => byKind.has(kind))
      .map((kind) => ({ kind, categories: byKind.get(kind)! })),
    topHouseholds: households.map(({ groupId, groupName, categories }) => ({
      groupId,
      groupName,
      categories,
    })),
  }
}
