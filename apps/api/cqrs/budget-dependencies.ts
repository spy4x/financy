import type { BudgetHandlerDependencies } from "../features/budgets/handlers.ts"
import { db } from "../services/db.ts"

/**
 * What the budget handlers run on: the budgets table, the actor's role read from the group's
 * membership in Postgres (never from a cache, since it decides who may write), the household's
 * base currency, the entries' ledger, the stored rates and the clock.
 */
export const budgetDependencies: BudgetHandlerDependencies = {
  budgets: db.budget,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
  settings: db.householdSettings,
  ledger: (groupId, currency, from, to) => db.transaction.ledger(groupId, currency, from, to),
  rate: async (base, quote, date) => {
    const lookup = await db.rates.lookup(base, quote, date)
    return lookup.found ? lookup.rate : null
  },
  now: () => new Date(),
}
