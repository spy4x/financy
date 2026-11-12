import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import type { AdminEntriesOverview } from "@domain/transactions"
import { readAdminEntries } from "@server/transactions/admin-entries.ts"
import type { APIContext } from "../../_types.ts"
import type { AdminApiModule } from "./module.ts"

/** What the entries route calls. */
export interface AdminEntriesRouteDependencies {
  limit: MiddlewareHandler<APIContext>
  read(): Promise<AdminEntriesOverview>
}

/**
 * `GET /entries` answers the operator's {@link AdminEntriesOverview}: how many entries, per month
 * and per household, and the latest entry day. Never an amount, a currency or a memo.
 */
export function createAdminEntriesRoutes(
  dependencies: AdminEntriesRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .get(`/entries`, dependencies.limit, async (c) => c.json(await dependencies.read()))
}

/** The entries module: Financy's entries counted across every household. */
export const entriesAdminModule: AdminApiModule = {
  id: `entries`,
  routes: ({ sql, limit }) =>
    createAdminEntriesRoutes({ limit, read: () => readAdminEntries(sql) }),
}
