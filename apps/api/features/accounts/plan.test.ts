import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { FREE_PLAN_ID, PlanError, PLANS, PRO_PLAN_ID } from "@domain/billing"
import { GroupRole } from "@domain/groups"
import { UserMFAStatus } from "@domain/identity"
import {
  AccountArchiveCommand,
  AccountCreateCommand,
  AccountDeleteCommand,
  AccountKind,
  AccountRestoreCommand,
  AccountUpdateCommand,
} from "@domain/accounts"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { testUsage } from "../../../../libs/domain/billing/test-plans.ts"
import { MemoryAccountRepository } from "../../_testing/memory-accounts.ts"
import {
  createAccountArchiveHandler,
  createAccountCreateHandler,
  createAccountDeleteHandler,
  createAccountRestoreHandler,
  createAccountUpdateHandler,
} from "./handlers.ts"

/**
 * Financy's own plan catalog over the accounts commands: a household without the paid plan keeps
 * reading, editing and deleting its accounts but adds none, the Household plan adds with no cap,
 * and with billing off nothing is capped. Seed's gate tests run on a test catalog, so this file is
 * the one that checks Financy's real `PLANS`.
 */

const OWNER = 1
const groupId = uuidV7()
const actor = { userId: OWNER, userMfa: UserMFAStatus.NOT_CONFIGURED } as never
const fields = { name: "Bank", kind: AccountKind.BANK, currency: "USD", startingBalance: 0 }

function stack(plan: string, billingEnabled = true) {
  const groups = { roleOf: () => Promise.resolve(GroupRole.OWNER) }
  const accounts = new MemoryAccountRepository()
  const dependencies = { accounts, groups }
  const commands = new CommandBus()
  commands.use(createEntitlementGate({
    billingEnabled,
    plans: PLANS,
    planOf: () => Promise.resolve(plan),
    roleOf: () => Promise.resolve(GroupRole.OWNER),
    usage: testUsage({
      maxAccounts: (group) => accounts.list(group).then((listed) => listed.length),
    }),
  }, ENTITLEMENT_NEEDS))
  commands.register(AccountCreateCommand, createAccountCreateHandler(dependencies))
  commands.register(AccountUpdateCommand, createAccountUpdateHandler(dependencies))
  commands.register(AccountArchiveCommand, createAccountArchiveHandler(dependencies))
  commands.register(AccountDeleteCommand, createAccountDeleteHandler(dependencies))
  commands.register(AccountRestoreCommand, createAccountRestoreHandler(dependencies))
  /** An account the household made while it still had the plan. */
  const existing = async () => {
    const id = uuidV7()
    await accounts.create({ groupId, id, ...fields, allowance: null }, OWNER)
    return id
  }
  return { accounts, commands, existing }
}

const createCommand = () => new AccountCreateCommand({ actor, groupId, id: uuidV7(), ...fields })

describe("accounts under Financy's plans", () => {
  it("refuses a new account in a household without the paid plan", async () => {
    const s = stack(FREE_PLAN_ID)
    await expect(s.commands.execute(createCommand())).rejects.toThrow(PlanError)
    expect((await s.accounts.list(groupId)).length).toBe(0)
  })

  it("refuses to restore a deleted account in a household without the paid plan", async () => {
    const s = stack(FREE_PLAN_ID)
    const id = await s.existing()
    await s.accounts.delete({ groupId, id, expectedVersion: 1 }, OWNER)
    await expect(s.commands.execute(new AccountRestoreCommand({ actor, groupId, id })))
      .rejects.toThrow(PlanError)
  })

  it("lets a household without the paid plan edit, archive and delete its accounts", async () => {
    const s = stack(FREE_PLAN_ID)
    const id = await s.existing()
    await s.commands.execute(
      new AccountUpdateCommand({ actor, groupId, id, ...fields, name: "Savings", version: 1 }),
    )
    await s.commands.execute(
      new AccountArchiveCommand({ actor, groupId, id, version: 2, archived: true }),
    )
    const { account } = await s.commands.execute(
      new AccountDeleteCommand({ actor, groupId, id, version: 3 }),
    )
    expect(account.name).toBe("Savings")
    expect(account.deletedAt).not.toBeNull()
  })

  it("adds accounts with no cap on the Household plan", async () => {
    const s = stack(PRO_PLAN_ID)
    for (let count = 0; count < 3; count++) await s.commands.execute(createCommand())
    expect((await s.accounts.list(groupId)).length).toBe(3)
  })

  it("adds accounts with no cap when billing is off", async () => {
    const s = stack(FREE_PLAN_ID, false)
    for (let count = 0; count < 3; count++) await s.commands.execute(createCommand())
    expect((await s.accounts.list(groupId)).length).toBe(3)
  })

  it("fails closed when a create reaches its handler without the entitlement gate", async () => {
    const accounts = new MemoryAccountRepository()
    const handler = createAccountCreateHandler({
      accounts,
      groups: { roleOf: () => Promise.resolve(GroupRole.OWNER) },
    })
    await expect(handler(createCommand())).rejects.toThrow("without the entitlement gate")
    expect((await accounts.list(groupId)).length).toBe(0)
  })

  it("fails closed when a restore reaches its handler without the entitlement gate", async () => {
    const accounts = new MemoryAccountRepository()
    const id = uuidV7()
    await accounts.create({ groupId, id, ...fields, allowance: null }, OWNER)
    await accounts.delete({ groupId, id, expectedVersion: 1 }, OWNER)
    const handler = createAccountRestoreHandler({
      accounts,
      groups: { roleOf: () => Promise.resolve(GroupRole.OWNER) },
    })
    await expect(handler(new AccountRestoreCommand({ actor, groupId, id })))
      .rejects.toThrow("without the entitlement gate")
    expect(await accounts.list(groupId)).toEqual([])
  })
})
