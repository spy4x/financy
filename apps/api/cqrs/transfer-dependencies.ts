import type { TransferHandlerDependencies } from "../features/transfers/handlers.ts"
import { db } from "../services/db.ts"

/**
 * What the transfer handlers run on: the transfers table, the actor's role read from the group's
 * membership in Postgres (never from a cache, since it decides who may write), and the clock.
 */
export const transferDependencies: TransferHandlerDependencies = {
  transfers: db.transfer,
  groups: {
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
  },
  now: () => new Date(),
}
