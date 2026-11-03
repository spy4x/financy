import { billingSettingsOf } from "../features/billing/config.ts"
import type { BillingHandlerDependencies } from "../features/billing/handlers.ts"
import { billingSetup } from "../services/billing.ts"
import { config } from "../services/config.ts"
import { db } from "../services/db.ts"
import { log } from "../services/log.ts"

/**
 * What the billing handlers run on: the billing tables, the actor's role read from the group's
 * membership in Postgres (never from a cache, since it decides who may pay), and the provider.
 */
export const billingDependencies: BillingHandlerDependencies = {
  billing: db.billing,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
  provider: billingSetup.provider,
  webAppUrl: config.webAppUrl,
  log,
  ...billingSettingsOf(billingSetup),
}
