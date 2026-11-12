import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { FREE_PLAN_ID, PlanError, PLANS, PRO_PLAN_ID } from "@domain/billing"
import {
  BudgetError,
  BudgetMethod,
  BudgetMethodSetCommand,
  BudgetMoveCommand,
  BudgetSetCommand,
} from "@domain/budgets"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { UserMFAStatus } from "@domain/identity"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { MemoryBudgetRepository } from "../../_testing/memory-budgets.ts"
import { testUsage } from "../../../../libs/domain/billing/test-plans.ts"
import {
  createBudgetMethodSetHandler,
  createBudgetMoveHandler,
  createBudgetSetHandler,
} from "./handlers.ts"

/**
 * Financy's own plan catalog over the budget commands: setting a limit, switching to envelopes and
 * moving money are Household plan features, a household without it can still remove the limits it
 * set and switch back to monthly limits, and with billing off nothing is refused. A viewer is told
 * it cannot edit before it is told about the plan.
 */

const OWNER = 1
const groupId = uuidV7()
const categoryId = uuidV7()
const otherCategoryId = uuidV7()
const actor = { userId: OWNER, userMfa: UserMFAStatus.NOT_CONFIGURED } as never

function stack(plan: string, billingEnabled = true, role = GroupRole.OWNER) {
  const budgets = new MemoryBudgetRepository(
    new Map([
      [categoryId, { groupId, kind: CategoryKind.EXPENSE }],
      [otherCategoryId, { groupId, kind: CategoryKind.EXPENSE }],
    ]),
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
  const dependencies = {
    budgets,
    groups,
    settings: { get: () => Promise.resolve({ baseCurrency: "USD" }) },
    ledger: () => Promise.reject(new Error("a write reads no ledger")),
    ledgerMonths: () => Promise.reject(new Error("a write reads no ledger")),
    rate: () => Promise.resolve(null),
    now: () => new Date("2026-11-05T12:00:00Z"),
  }
  commands.register(BudgetSetCommand, createBudgetSetHandler(dependencies))
  commands.register(BudgetMethodSetCommand, createBudgetMethodSetHandler(dependencies))
  commands.register(BudgetMoveCommand, createBudgetMoveHandler(dependencies))
  return { budgets, commands }
}

const set = (amount: number | null, expectedVersion: number | null = null) =>
  new BudgetSetCommand({ actor, groupId, categoryId, month: "2026-11", amount, expectedVersion })

const switchTo = (method: BudgetMethod) =>
  new BudgetMethodSetCommand({ actor, groupId, method, expectedVersion: null })

const move = () =>
  new BudgetMoveCommand({
    actor,
    id: uuidV7(),
    groupId,
    month: "2026-11",
    fromCategoryId: categoryId,
    toCategoryId: otherCategoryId,
    amount: 1000,
  })

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

  it("refuses envelopes and a move without the paid plan, and lets the household switch back to limits", async () => {
    const s = stack(FREE_PLAN_ID)
    await expect(s.commands.execute(switchTo(BudgetMethod.ENVELOPES))).rejects.toThrow(PlanError)
    await expect(s.commands.execute(move())).rejects.toThrow(PlanError)
    const { method } = await s.commands.execute(switchTo(BudgetMethod.LIMITS))
    expect(method).toMatchObject({ month: "2026-11", method: BudgetMethod.LIMITS })
    expect(s.budgets.writes).toBe(1)
  })

  it("switches to envelopes and moves money on the Household plan", async () => {
    const s = stack(PRO_PLAN_ID)
    const { method } = await s.commands.execute(switchTo(BudgetMethod.ENVELOPES))
    expect(method).toMatchObject({ method: BudgetMethod.ENVELOPES })
    const { move: moved } = await s.commands.execute(move())
    expect(moved).toMatchObject({ amount: 1000, currency: "USD" })
  })

  it("tells an editor it cannot switch the method before it tells it about the plan", async () => {
    const s = stack(FREE_PLAN_ID, true, GroupRole.EDITOR)
    const refusal = await s.commands.execute(switchTo(BudgetMethod.ENVELOPES)).catch((error) =>
      error
    )
    expect(refusal).toBeInstanceOf(BudgetError)
    expect(refusal).toMatchObject({ code: "ROLE_INSUFFICIENT" })
  })
})
