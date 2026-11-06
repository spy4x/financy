import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import type { AdminAccountsOverview } from "@domain/accounts"
import { readAdminAccounts } from "@server/accounts/admin-accounts.ts"
import type { APIContext } from "../../_types.ts"
import type { AdminApiModule } from "./module.ts"

/** What the accounts route calls. */
export interface AdminAccountsRouteDependencies {
  limit: MiddlewareHandler<APIContext>
  read(): Promise<AdminAccountsOverview>
}

/**
 * `GET /accounts` answers the operator's {@link AdminAccountsOverview}: how many accounts, of which
 * kinds and in which currencies, and the households with the most. Never a name or an amount.
 */
export function createAdminAccountsRoutes(
  dependencies: AdminAccountsRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .get(`/accounts`, dependencies.limit, async (c) => c.json(await dependencies.read()))
}

/** The accounts module: Financy's accounts counted across every household. */
export const accountsAdminModule: AdminApiModule = {
  id: `accounts`,
  routes: ({ sql, limit }) =>
    createAdminAccountsRoutes({ limit, read: () => readAdminAccounts(sql) }),
}
