import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import type { AdminBudgetsOverview } from "@domain/budgets"
import { readAdminBudgets } from "@server/budgets/admin-budgets.ts"
import type { APIContext } from "../../_types.ts"
import type { AdminApiModule } from "./module.ts"

/** What the budgets route calls. */
export interface AdminBudgetsRouteDependencies {
  limit: MiddlewareHandler<APIContext>
  read(): Promise<AdminBudgetsOverview>
}

/**
 * `GET /budgets` answers the operator's {@link AdminBudgetsOverview}: per household, how many
 * categories have a limit this month and the method in effect. Never an amount or a currency.
 */
export function createAdminBudgetsRoutes(
  dependencies: AdminBudgetsRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .get(`/budgets`, dependencies.limit, async (c) => c.json(await dependencies.read()))
}

/** The budgets module: Financy's budgets counted across every household. */
export const budgetsAdminModule: AdminApiModule = {
  id: `budgets`,
  routes: ({ sql, limit }) =>
    createAdminBudgetsRoutes({ limit, read: () => readAdminBudgets(sql) }),
}
