import type { CategoryHandlerDependencies } from "../features/categories/handlers.ts"
import { db } from "../services/db.ts"

/**
 * What the category handlers run on: the categories table, and the actor's role read from the
 * group's membership in Postgres (never from a cache, since it decides who may write).
 */
export const categoryDependencies: CategoryHandlerDependencies = {
  categories: db.category,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
}
