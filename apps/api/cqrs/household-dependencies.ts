import type { HouseholdHandlerDependencies } from "../features/household/handlers.ts"
import { db } from "../services/db.ts"

/**
 * What the household handlers run on: the settings and rates tables, and the actor's role read
 * from the group's membership in Postgres (never from a cache, since it decides who may write).
 */
export const householdDependencies: HouseholdHandlerDependencies = {
  settings: db.householdSettings,
  rates: db.rates,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
}
