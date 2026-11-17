import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import type { AdminRecurringOverview } from "@domain/recurring"
import { readAdminRecurring } from "@server/recurring/admin-recurring.ts"
import type { APIContext } from "../../_types.ts"
import type { AdminApiModule } from "./module.ts"

/** What the repeating entries route calls. */
export interface AdminRecurringRouteDependencies {
  limit: MiddlewareHandler<APIContext>
  read(): Promise<AdminRecurringOverview>
}

/**
 * `GET /recurring` answers the operator's {@link AdminRecurringOverview}: per household, how many
 * rules it has, how many are paused and how many entries they made. Never an amount or a memo.
 */
export function createAdminRecurringRoutes(
  dependencies: AdminRecurringRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .get(`/recurring`, dependencies.limit, async (c) => c.json(await dependencies.read()))
}

/** The repeating entries module: Financy's repeating rules counted across every household. */
export const recurringAdminModule: AdminApiModule = {
  id: `recurring`,
  routes: ({ sql, limit }) =>
    createAdminRecurringRoutes({ limit, read: () => readAdminRecurring(sql) }),
}
