import type { RecurringRuleHandlerDependencies } from "../features/recurring/handlers.ts"
import { db } from "../services/db.ts"

/**
 * What the repeating rule handlers run on: the rules table and the actor's role read from the
 * group's membership in Postgres (never from a cache, since it decides who may write).
 */
export const recurringRuleDependencies: RecurringRuleHandlerDependencies = {
  rules: db.recurringRule,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
}
