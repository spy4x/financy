import type { TransactionHandlerDependencies } from "../features/transactions/handlers.ts"
import { db } from "../services/db.ts"

/**
 * What the entry handlers run on: the transactions table, the actor's role read from the group's
 * membership in Postgres (never from a cache, since it decides who may write), and the clock.
 */
export const transactionDependencies: TransactionHandlerDependencies = {
  transactions: db.transaction,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
  now: () => new Date(),
}
