import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { FREE_PLAN_ID, PlanError, PLANS, PRO_PLAN_ID } from "@domain/billing"
import { BudgetError, BudgetSetCommand } from "@domain/budgets"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { UserMFAStatus } from "@domain/identity"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { MemoryBudgetRepository } from "../../_testing/memory-budgets.ts"
import { testUsage } from "../../../../libs/domain/billing/test-plans.ts"
import { createBudgetSetHandler } from "./handlers.ts"

/**
 * Financy's own plan catalog over `budget.set`: setting a limit is a Household plan feature, a
 * household without it can still remove the limits it set, and with billing off nothing is
 * refused. A viewer is told it cannot edit before it is told about the plan.
 */

const OWNER = 1
const groupId = uuidV7()
const categoryId = uuidV7()
const actor = { userId: OWNER, userMfa: UserMFAStatus.NOT_CONFIGURED } as never

function stack(plan: string, billingEnabled = true, role = GroupRole.OWNER) {
  const budgets = new MemoryBudgetRepository(
    new Map([[categoryId, { groupId, kind: CategoryKind.EXPENSE }]]),
  )
  const groups = { roleOf: () => Promise.resolve(role) }
  const commands = new CommandBus()
  commands.use(createEntitlementGate({
    billingEnabled,
    plans: PLANS,
    planOf: () => Promise.resolve(plan),
    roleOf: () => Promise.resolve(role),
    usage: testUsage({}),
  }, ENTITLEMENT_NEEDS))
  commands.register(
    BudgetSetCommand,
    createBudgetSetHandler({
      budgets,
      groups,
      settings: { get: () => Promise.resolve({ baseCurrency: "USD" }) },
      ledger: () => Promise.reject(new Error("a set reads no ledger")),
      ledgerMonths: () => Promise.reject(new Error("a set reads no ledger")),
      rate: () => Promise.resolve(null),
      now: () => new Date("2026-11-05T12:00:00Z"),
    }),
  )
  return { budgets, commands }
}

const set = (amount: number | null, expectedVersion: number | null = null) =>
  new BudgetSetCommand({ actor, groupId, categoryId, month: "2026-11", amount, expectedVersion })

describe("budgets under Financy's plans", () => {
  it("refuses a new limit in a household without the paid plan", async () => {
    const s = stack(FREE_PLAN_ID)
    await expect(s.commands.execute(set(50000))).rejects.toThrow(PlanError)
    expect(s.budgets.writes).toBe(0)
  })

  it("lets a household without the paid plan remove a limit", async () => {
    const s = stack(FREE_PLAN_ID)
    const { budget } = await s.commands.execute(set(null))
    expect(budget).toMatchObject({ amount: null, currency: null, version: 1 })
  })

  it("sets limits on the Household plan", async () => {
    const s = stack(PRO_PLAN_ID)
    const { budget } = await s.commands.execute(set(50000))
    expect(budget).toMatchObject({ amount: 50000, currency: "USD" })
  })

  it("sets limits on any plan when billing is off", async () => {
    const s = stack(FREE_PLAN_ID, false)
    const { budget } = await s.commands.execute(set(50000))
    expect(budget).toMatchObject({ amount: 50000 })
  })

  it("tells a viewer it cannot edit before it tells it about the plan", async () => {
    const s = stack(FREE_PLAN_ID, true, GroupRole.VIEWER)
    const refusal = await s.commands.execute(set(50000)).catch((error) => error)
    expect(refusal).toBeInstanceOf(BudgetError)
    expect(refusal).toMatchObject({ code: "ROLE_INSUFFICIENT" })
  })
})
