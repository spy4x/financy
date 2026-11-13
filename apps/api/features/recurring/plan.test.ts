import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { FREE_PLAN_ID, PlanError, PLANS, PRO_PLAN_ID } from "@domain/billing"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { UserMFAStatus } from "@domain/identity"
import { TransactionKind } from "@domain/transactions"
import {
  RecurringRuleCreateCommand,
  RecurringRuleDeleteCommand,
  RecurringRuleRestoreCommand,
  RecurringRuleSkipCommand,
  RecurringRuleUpdateCommand,
} from "@domain/recurring"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { MemoryRecurringRuleRepository } from "../../_testing/memory-recurring-rules.ts"
import { testUsage } from "../../../../libs/domain/billing/test-plans.ts"
import {
  createRecurringRuleCreateHandler,
  createRecurringRuleDeleteHandler,
  createRecurringRuleRestoreHandler,
  createRecurringRuleSkipHandler,
  createRecurringRuleUpdateHandler,
} from "./handlers.ts"

/**
 * Financy's own plan catalog over the repeating rule commands: a household without the paid plan
 * keeps editing, skipping and deleting its rules but adds none and brings none back, the Household
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
  amount: 120000,
  currency: `USD`,
  rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`,
  startDate: `2026-12-01`,
}
const stored = { ...fields, accountAmount: null, memo: ``, endDate: null, count: null }

function repository() {
  return new MemoryRecurringRuleRepository({
    accounts: new Map([[accountId, { groupId, currency: `USD` }]]),
    categories: new Map([[categoryId, { groupId, kind: CategoryKind.EXPENSE }]]),
  })
}

function stack(plan: string, billingEnabled = true, rules = repository()) {
  const dependencies = { rules, groups: { roleOf: () => Promise.resolve(GroupRole.OWNER) } }
  const commands = new CommandBus()
  commands.use(createEntitlementGate({
    billingEnabled,
    plans: PLANS,
    planOf: () => Promise.resolve(plan),
    roleOf: () => Promise.resolve(GroupRole.OWNER),
    usage: testUsage({ maxRecurringRules: (group) => rules.count(group) }),
  }, ENTITLEMENT_NEEDS))
  commands.register(RecurringRuleCreateCommand, createRecurringRuleCreateHandler(dependencies))
  commands.register(RecurringRuleUpdateCommand, createRecurringRuleUpdateHandler(dependencies))
  commands.register(RecurringRuleDeleteCommand, createRecurringRuleDeleteHandler(dependencies))
  commands.register(RecurringRuleRestoreCommand, createRecurringRuleRestoreHandler(dependencies))
  commands.register(RecurringRuleSkipCommand, createRecurringRuleSkipHandler(dependencies))
  /** A rule the household wrote while it still had the plan. */
  const existing = async () => {
    const id = uuidV7()
    await rules.create({ groupId, id, ...stored, allowance: null }, OWNER)
    return id
  }
  return { rules, commands, existing }
}

const createCommand = () =>
  new RecurringRuleCreateCommand({ actor, groupId, id: uuidV7(), ...fields })

describe(`repeating rules under Financy's plans`, () => {
  it(`refuses a new rule in a household without the paid plan`, async () => {
    const s = stack(FREE_PLAN_ID)
    await expect(s.commands.execute(createCommand())).rejects.toThrow(PlanError)
    expect(await s.rules.count(groupId)).toBe(0)
  })

  it(`lets a household without the paid plan edit, skip and delete, but not bring one back`, async () => {
    const s = stack(FREE_PLAN_ID)
    const id = await s.existing()
    await s.commands.execute(
      new RecurringRuleUpdateCommand({ actor, groupId, id, ...fields, memo: `Rent`, version: 1 }),
    )
    await s.commands.execute(
      new RecurringRuleSkipCommand({ actor, groupId, id, date: `2027-01-01` }),
    )
    const { rule } = await s.commands.execute(
      new RecurringRuleDeleteCommand({ actor, groupId, id, version: 3 }),
    )
    expect(rule).toMatchObject({ memo: `Rent`, skippedDates: [`2027-01-01`], version: 4 })

    await expect(
      s.commands.execute(new RecurringRuleRestoreCommand({ actor, groupId, id })),
    ).rejects.toThrow(PlanError)
    expect(s.rules.rules.get(id)?.deletedAt).not.toBeNull()
  })

  it(`adds rules and brings them back with no cap on the Household plan`, async () => {
    const s = stack(PRO_PLAN_ID)
    for (let rule = 0; rule < 3; rule++) await s.commands.execute(createCommand())
    const id = await s.existing()
    await s.commands.execute(new RecurringRuleDeleteCommand({ actor, groupId, id, version: 1 }))
    await s.commands.execute(new RecurringRuleRestoreCommand({ actor, groupId, id }))
    expect(await s.rules.count(groupId)).toBe(4)
  })

  it(`adds rules with no cap when billing is off`, async () => {
    const s = stack(FREE_PLAN_ID, false)
    for (let rule = 0; rule < 3; rule++) await s.commands.execute(createCommand())
    expect(await s.rules.count(groupId)).toBe(3)
  })

  it(`fails closed when a create or a restore reaches its handler without the entitlement gate`, async () => {
    const rules = repository()
    const dependencies = { rules, groups: { roleOf: () => Promise.resolve(GroupRole.OWNER) } }
    const id = uuidV7()
    await rules.create({ groupId, id, ...stored, allowance: null }, OWNER)
    await rules.delete({ groupId, id, expectedVersion: 1 }, OWNER)

    await expect(createRecurringRuleCreateHandler(dependencies)(createCommand()))
      .rejects.toThrow(`without the entitlement gate`)
    await expect(
      createRecurringRuleRestoreHandler(dependencies)(
        new RecurringRuleRestoreCommand({ actor, groupId, id }),
      ),
    ).rejects.toThrow(`without the entitlement gate`)
    expect(await rules.count(groupId)).toBe(0)
  })
})
