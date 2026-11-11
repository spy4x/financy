import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import type { AdminCategoriesOverview } from "@domain/categories"
import { readAdminCategories } from "@server/categories/admin-categories.ts"
import type { APIContext } from "../../_types.ts"
import type { AdminApiModule } from "./module.ts"

/** What the categories route calls. */
export interface AdminCategoriesRouteDependencies {
  limit: MiddlewareHandler<APIContext>
  read(): Promise<AdminCategoriesOverview>
}

/**
 * `GET /categories` answers the operator's {@link AdminCategoriesOverview}: how many categories,
 * of which kinds, and the households with the most. Never a name, an icon or a colour.
 */
export function createAdminCategoriesRoutes(
  dependencies: AdminCategoriesRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .get(`/categories`, dependencies.limit, async (c) => c.json(await dependencies.read()))
}

/** The categories module: Financy's categories counted across every household. */
export const categoriesAdminModule: AdminApiModule = {
  id: `categories`,
  routes: ({ sql, limit }) =>
    createAdminCategoriesRoutes({ limit, read: () => readAdminCategories(sql) }),
}
