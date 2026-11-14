import { createPlanOf } from "../features/billing/config.ts"
import { billingSetup } from "../services/billing.ts"
import { db, sql } from "../services/db.ts"
import { PostgresInvitationRepository } from "@server/groups/postgres-invitation-repository.ts"
import { countPlanTransactions } from "@server/transactions/plan-count.ts"
import { createEntitlementGate } from "./entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "./entitlement-needs.ts"

/**
 * The command bus's plan check, on the billing tables and the membership in Postgres (never a
 * cache: it decides what a group may do).
 */
export const entitlementGate = createEntitlementGate(
  {
    billingEnabled: billingSetup.provider !== null,
    planOf: createPlanOf(db.billing, billingSetup),
    roleOf: async (groupId, userId) => (await db.group.getForMember(groupId, userId))?.role ?? null,
    usage: {
      maxNotes: (groupId) => db.note.count(groupId),
      maxMembers: (groupId) => new PostgresInvitationRepository(sql).countMembers(groupId),
      maxAccounts: (groupId) => db.account.count(groupId),
      maxCategories: (groupId) => db.category.count(groupId),
      maxTransactions: (groupId) => countPlanTransactions(sql, groupId),
      maxRecurringRules: (groupId) => db.recurringRule.count(groupId),
    },
  },
  ENTITLEMENT_NEEDS,
)
