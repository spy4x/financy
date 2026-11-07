import type { AccountHandlerDependencies } from "../features/accounts/handlers.ts"
import { db } from "../services/db.ts"

/**
 * What the account handlers run on: the accounts table, and the actor's role read from the group's
 * membership in Postgres (never from a cache, since it decides who may write).
 */
export const accountDependencies: AccountHandlerDependencies = {
  accounts: db.account,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
}
