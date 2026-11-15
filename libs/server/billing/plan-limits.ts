import {
  type BillingRepository,
  effectivePlanId,
  entitlementsOf,
  type LimitKey,
  type Plan,
  UNLIMITED,
} from "@domain/billing"

/** What a job reads a group's plan caps with: whether billing is on, its grace period, the catalog. */
export interface PlanLimitsSetup {
  billingEnabled: boolean
  graceDays: number
  /** The plan catalog, `PLANS` unless a test passes its own. */
  plans?: readonly Plan[]
}

/**
 * A group's plan caps at `now`, as the API's entitlement gate reads them: none while billing is
 * off, else the caps of the plan the group is on (`effectivePlanId`), the free plan's once a lapsed
 * subscription's grace has ended. A job that writes for a person reads them here.
 */
export async function planLimitsOf(
  billing: Pick<BillingRepository, "get">,
  groupId: string,
  setup: PlanLimitsSetup,
  now: Date,
): Promise<Readonly<Record<LimitKey, number | null>>> {
  if (!setup.billingEnabled) return UNLIMITED.limits
  const plan = effectivePlanId(await billing.get(groupId), now, setup.graceDays, setup.plans)
  return entitlementsOf(plan, true, setup.plans).limits
}
