import { Hono } from "hono"
import type { MiddlewareHandler } from "hono"
import type { AdminRatesSnapshot } from "@domain/money"
import { readAdminRates } from "@server/money/admin-rates.ts"
import type { APIContext } from "../../_types.ts"
import type { AdminApiModule } from "./module.ts"

/** What the Exchange rates route calls. */
export interface AdminRatesRouteDependencies {
  limit: MiddlewareHandler<APIContext>
  read(): Promise<AdminRatesSnapshot>
}

/**
 * `GET /rates` answers the Exchange rates page's {@link AdminRatesSnapshot}: counts and currency
 * codes only, never a household or how many households use a currency.
 */
export function createAdminRatesRoutes(
  dependencies: AdminRatesRouteDependencies,
): Hono<APIContext> {
  return new Hono<APIContext>()
    .get(`/rates`, dependencies.limit, async (c) => c.json(await dependencies.read()))
}

/** The Exchange rates module: the daily rates, what has none today, and the paid fallback. */
export const ratesAdminModule: AdminApiModule = {
  id: `rates`,
  routes: ({ sql, limit, now, rates }) =>
    createAdminRatesRoutes({ limit, read: () => readAdminRates(sql, now(), rates.fallbackCap) }),
}
