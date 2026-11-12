import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupRole } from "@domain/groups"
import {
  assertRoomFor,
  BillingPeriod,
  BillingStatus,
  entitlementsOf,
  FREE_PLAN_ID,
  freePlanAllowsNothing,
  needsFirstPlan,
  PAID_PLANS,
  PlanError,
  PLANS,
  PRO_PLAN_ID,
  type StoredSubscription,
  toGroupBilling,
  UNLIMITED,
} from "./+lib.ts"

/**
 * Financy's own catalog (`docs/financy/product.md`, "Price"). Seed's tests run on a test catalog,
 * so these are the tests that hold Financy's prices and caps.
 */

const NOW = new Date("2026-11-08T10:00:00Z")
const household = PLANS.find((plan) => plan.id === PRO_PLAN_ID)!
const free = PLANS.find((plan) => plan.id === FREE_PLAN_ID)!
const firstScreen = (role: GroupRole) =>
  needsFirstPlan(toGroupBilling(null, role, true, false, NOW, 7, 1, false, PLANS), PLANS)

describe("Financy's plans", () => {
  it("sells one Household plan at $4 a month or $40 a year, with no trial", () => {
    expect(PAID_PLANS.map((plan) => plan.id)).toEqual([PRO_PLAN_ID])
    expect(household).toMatchObject({
      name: "Household",
      amount: 400,
      yearlyAmount: 4000,
      currency: "USD",
      trialDays: 0,
      refundDays: 30,
    })
  })

  it("charges per household, so inviting a member costs nothing more", () => {
    expect(household.perSeat).toBe(false)
    // The invite form shows a charge only when `seatPrice` is set.
    const paid = {
      groupId: "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111002",
      providerSubscriptionId: "sub_1",
      planId: PRO_PLAN_ID,
      status: BillingStatus.Active,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      pastDueSince: null,
      trialEnd: null,
      quantity: 1,
      everActive: true,
      period: BillingPeriod.Monthly,
    } satisfies StoredSubscription
    const billing = toGroupBilling(paid, GroupRole.OWNER, true, true, NOW, 7, 3, false, PLANS)
    expect(billing.seatPrice).toBeNull()
  })

  it("lets six members into a household and refuses the seventh", () => {
    const { maxMembers } = household.entitlements.limits
    expect(() => assertRoomFor("maxMembers", maxMembers, 5, GroupRole.OWNER)).not.toThrow()
    expect(() => assertRoomFor("maxMembers", maxMembers, 6, GroupRole.OWNER)).toThrow(PlanError)
  })

  it("puts no cap on notes, files, accounts, categories or transactions on the Household plan", () => {
    const { maxNotes, maxAttachments, maxAccounts, maxCategories, maxTransactions } =
      household.entitlements.limits
    expect([maxNotes, maxAttachments, maxAccounts, maxCategories, maxTransactions]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ])
  })

  it("lets a household without the plan add nothing", () => {
    expect(freePlanAllowsNothing(PLANS)).toBe(true)
    expect(free.entitlements.limits.maxAccounts).toBe(0)
    expect(free.entitlements.limits.maxCategories).toBe(0)
    expect(free.entitlements.limits.maxTransactions).toBe(0)
  })

  it("sends a new owner to checkout first, and an invited member not", () => {
    expect(firstScreen(GroupRole.OWNER)).toBe(true)
    expect(firstScreen(GroupRole.EDITOR)).toBe(false)
  })

  it("gives every feature with no cap when billing is off", () => {
    expect(entitlementsOf(FREE_PLAN_ID, false, PLANS)).toEqual(UNLIMITED)
    expect(UNLIMITED.limits.maxAccounts).toBeNull()
    expect(UNLIMITED.limits.maxCategories).toBeNull()
    expect(UNLIMITED.limits.maxTransactions).toBeNull()
    expect(UNLIMITED.features.memberRoles).toBe(true)
  })
})
