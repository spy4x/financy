import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import type { AdminTransfersOverview } from "@domain/transfers"
import { readAdminTransfers } from "@server/transfers/admin-transfers.ts"
import type { APIContext } from "../../_types.ts"
import type { AdminApiModule } from "./module.ts"

/** What the transfers route calls. */
export interface AdminTransfersRouteDependencies {
  limit: MiddlewareHandler<APIContext>
  read(): Promise<AdminTransfersOverview>
}

/**
 * `GET /transfers` answers the operator's {@link AdminTransfersOverview}: how many transfers, per
 * month and per household, and the latest transfer day. Never an amount, a currency or a memo.
 */
export function createAdminTransfersRoutes(
  dependencies: AdminTransfersRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .get(`/transfers`, dependencies.limit, async (c) => c.json(await dependencies.read()))
}

/** The transfers module: Financy's transfers counted across every household. */
export const transfersAdminModule: AdminApiModule = {
  id: `transfers`,
  routes: ({ sql, limit }) =>
    createAdminTransfersRoutes({ limit, read: () => readAdminTransfers(sql) }),
}
