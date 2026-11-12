import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { FREE_PLAN_ID, PlanError, PLANS, PRO_PLAN_ID } from "@domain/billing"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { UserMFAStatus } from "@domain/identity"
import {
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionKind,
  TransactionRestoreCommand,
  TransactionUpdateCommand,
} from "@domain/transactions"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { MemoryTransactionRepository } from "../../_testing/memory-transactions.ts"
import { testUsage } from "../../../../libs/domain/billing/test-plans.ts"
import {
  createTransactionCreateHandler,
  createTransactionDeleteHandler,
  createTransactionRestoreHandler,
  createTransactionUpdateHandler,
} from "./handlers.ts"

/**
 * Financy's own plan catalog over the entry commands: a household without the paid plan keeps
 * reading, editing and deleting its entries but adds none and brings none back, the Household
 * plan has no cap, and with billing off nothing is capped.
 */

const OWNER = 1
const groupId = uuidV7()
const accountId = uuidV7()
const categoryId = uuidV7()
const actor = { userId: OWNER, userMfa: UserMFAStatus.NOT_CONFIGURED } as never
const fields = {
  accountId,
  categoryId,
  kind: TransactionKind.EXPENSE,
  amount: 1234,
  currency: "USD",
  date: "2026-11-05",
}

function repository() {
  return new MemoryTransactionRepository({
    accounts: new Map([[accountId, { groupId, currency: "USD" }]]),
    categories: new Map([[categoryId, { groupId, kind: CategoryKind.EXPENSE }]]),
    timeZones: new Map(),
    rates: () => Promise.resolve(null),
  })
}

function stack(plan: string, billingEnabled = true, transactions = repository()) {
  const groups = { roleOf: () => Promise.resolve(GroupRole.OWNER) }
  const dependencies = { transactions, groups, now: () => new Date("2026-11-05T12:00:00Z") }
  const commands = new CommandBus()
  commands.use(createEntitlementGate({
    billingEnabled,
    plans: PLANS,
    planOf: () => Promise.resolve(plan),
    roleOf: () => Promise.resolve(GroupRole.OWNER),
    usage: testUsage({ maxTransactions: (group) => transactions.count(group) }),
  }, ENTITLEMENT_NEEDS))
  commands.register(TransactionCreateCommand, createTransactionCreateHandler(dependencies))
  commands.register(TransactionUpdateCommand, createTransactionUpdateHandler(dependencies))
  commands.register(TransactionDeleteCommand, createTransactionDeleteHandler(dependencies))
  commands.register(TransactionRestoreCommand, createTransactionRestoreHandler(dependencies))
  /** An entry the household wrote while it still had the plan. */
  const existing = async () => {
    const id = uuidV7()
    await transactions.create({ groupId, id, ...fields, memo: "", allowance: null }, OWNER)
    return id
  }
  return { transactions, commands, existing }
}

const createCommand = () =>
  new TransactionCreateCommand({ actor, groupId, id: uuidV7(), ...fields })

describe("entries under Financy's plans", () => {
  it("refuses a new entry in a household without the paid plan", async () => {
    const s = stack(FREE_PLAN_ID)
    await expect(s.commands.execute(createCommand())).rejects.toThrow(PlanError)
    expect(await s.transactions.count(groupId)).toBe(0)
  })

  it("lets a household without the paid plan edit and delete, but not bring one back", async () => {
    const s = stack(FREE_PLAN_ID)
    const id = await s.existing()
    await s.commands.execute(
      new TransactionUpdateCommand({ actor, groupId, id, ...fields, memo: "Lunch", version: 1 }),
    )
    const { transaction } = await s.commands.execute(
      new TransactionDeleteCommand({ actor, groupId, id, version: 2 }),
    )
    expect(transaction).toMatchObject({ memo: "Lunch", version: 3 })

    await expect(
      s.commands.execute(new TransactionRestoreCommand({ actor, groupId, id })),
    ).rejects.toThrow(PlanError)
    expect(s.transactions.transactions.get(id)?.deletedAt).not.toBeNull()
  })

  it("adds entries and brings them back with no cap on the Household plan", async () => {
    const s = stack(PRO_PLAN_ID)
    for (let entry = 0; entry < 3; entry++) await s.commands.execute(createCommand())
    const id = await s.existing()
    await s.commands.execute(new TransactionDeleteCommand({ actor, groupId, id, version: 1 }))
    await s.commands.execute(new TransactionRestoreCommand({ actor, groupId, id }))
    expect(await s.transactions.count(groupId)).toBe(4)
  })

  it("adds entries with no cap when billing is off", async () => {
    const s = stack(FREE_PLAN_ID, false)
    for (let entry = 0; entry < 3; entry++) await s.commands.execute(createCommand())
    expect(await s.transactions.count(groupId)).toBe(3)
  })

  it("fails closed when a create or a restore reaches its handler without the entitlement gate", async () => {
    const transactions = repository()
    const dependencies = {
      transactions,
      groups: { roleOf: () => Promise.resolve(GroupRole.OWNER) },
      now: () => new Date(),
    }
    const id = uuidV7()
    await transactions.create({ groupId, id, ...fields, memo: "", allowance: null }, OWNER)

    await expect(createTransactionCreateHandler(dependencies)(createCommand()))
      .rejects.toThrow("without the entitlement gate")
    await expect(
      createTransactionRestoreHandler(dependencies)(
        new TransactionRestoreCommand({ actor, groupId, id }),
      ),
    ).rejects.toThrow("without the entitlement gate")
    expect(await transactions.count(groupId)).toBe(1)
  })
})
