import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { FREE_PLAN_ID, PlanError, PLANS, PRO_PLAN_ID } from "@domain/billing"
import { GroupRole } from "@domain/groups"
import { UserMFAStatus } from "@domain/identity"
import {
  CategoryArchiveCommand,
  CategoryCreateCommand,
  type CategoryIcon,
  CategoryKind,
  CategoryUpdateCommand,
} from "@domain/categories"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { MemoryCategoryRepository } from "../../_testing/memory-categories.ts"
import { testUsage } from "../../../../libs/domain/billing/test-plans.ts"
import {
  createCategoryArchiveHandler,
  createCategoryCreateHandler,
  createCategoryUpdateHandler,
} from "./handlers.ts"

/**
 * Financy's own plan catalog over the category commands: a household without the paid plan keeps
 * reading, editing and archiving its categories but adds none and brings none back (D1), the
 * Household plan has no cap, and with billing off nothing is capped.
 */

const OWNER = 1
const groupId = uuidV7()
const actor = { userId: OWNER, userMfa: UserMFAStatus.NOT_CONFIGURED } as never
const fields = {
  name: "Food",
  kind: CategoryKind.EXPENSE,
  icon: "utensils" as CategoryIcon,
  color: "#c2410c",
  parentId: null,
}

function stack(
  plan: string,
  billingEnabled = true,
  plans = PLANS,
  categories = new MemoryCategoryRepository(),
) {
  const groups = { roleOf: () => Promise.resolve(GroupRole.OWNER) }
  const dependencies = { categories, groups }
  const commands = new CommandBus()
  commands.use(createEntitlementGate({
    billingEnabled,
    plans,
    planOf: () => Promise.resolve(plan),
    roleOf: () => Promise.resolve(GroupRole.OWNER),
    usage: testUsage({ maxCategories: (group) => categories.count(group) }),
  }, ENTITLEMENT_NEEDS))
  commands.register(CategoryCreateCommand, createCategoryCreateHandler(dependencies))
  commands.register(CategoryUpdateCommand, createCategoryUpdateHandler(dependencies))
  commands.register(CategoryArchiveCommand, createCategoryArchiveHandler(dependencies))
  /** A category the household made while it still had the plan. */
  const existing = async (name = "Food") => {
    const id = uuidV7()
    await categories.create({ groupId, id, ...fields, name, allowance: null }, OWNER)
    return id
  }
  return { categories, commands, existing }
}

const createCommand = (name = "Travel") =>
  new CategoryCreateCommand({ actor, groupId, id: uuidV7(), ...fields, name })
const archiveCommand = (id: string, version: number, archived: boolean) =>
  new CategoryArchiveCommand({ actor, groupId, id, version, archived })

describe("categories under Financy's plans", () => {
  it("refuses a new category in a household without the paid plan", async () => {
    const s = stack(FREE_PLAN_ID)
    await expect(s.commands.execute(createCommand())).rejects.toThrow(PlanError)
    expect(await s.categories.list(groupId)).toEqual([])
  })

  it("lets a household without the paid plan edit and archive, but not bring one back (D1)", async () => {
    const s = stack(FREE_PLAN_ID)
    const id = await s.existing()
    await s.commands.execute(
      new CategoryUpdateCommand({ actor, groupId, id, ...fields, name: "Meals", version: 1 }),
    )
    const { category } = await s.commands.execute(archiveCommand(id, 2, true))
    expect(category).toMatchObject({ name: "Meals", version: 3 })
    expect(category.archivedAt).not.toBeNull()

    await expect(s.commands.execute(archiveCommand(id, 3, false))).rejects.toThrow(PlanError)
    expect((await s.categories.get(groupId, id))?.archivedAt).not.toBeNull()
  })

  it("adds categories and brings them back with no cap on the Household plan", async () => {
    const s = stack(PRO_PLAN_ID)
    for (const name of ["A", "B", "C"]) await s.commands.execute(createCommand(name))
    const id = await s.existing()
    await s.commands.execute(archiveCommand(id, 1, true))
    await s.commands.execute(archiveCommand(id, 2, false))
    expect(await s.categories.count(groupId)).toBe(4)
  })

  it("adds categories with no cap when billing is off", async () => {
    const s = stack(FREE_PLAN_ID, false)
    for (const name of ["A", "B", "C"]) await s.commands.execute(createCommand(name))
    expect(await s.categories.count(groupId)).toBe(3)
  })

  it("passes the plan's cap on to the repository on create, archive and unarchive", async () => {
    /** Each `allowance` the handlers hand the repository. */
    const seen: (number | null)[] = []
    class Recording extends MemoryCategoryRepository {
      override create(...args: Parameters<MemoryCategoryRepository["create"]>) {
        seen.push(args[0].allowance)
        return super.create(...args)
      }
      override archive(...args: Parameters<MemoryCategoryRepository["archive"]>) {
        seen.push(args[0].allowance)
        return super.archive(...args)
      }
    }
    const capped = PLANS.map((plan) => {
      if (plan.id !== PRO_PLAN_ID) return plan
      const { entitlements } = plan
      return {
        ...plan,
        entitlements: { ...entitlements, limits: { ...entitlements.limits, maxCategories: 5 } },
      }
    })
    const s = stack(PRO_PLAN_ID, true, capped, new Recording())
    const id = await s.existing()
    seen.length = 0

    await s.commands.execute(createCommand())
    await s.commands.execute(archiveCommand(id, 1, true))
    await s.commands.execute(archiveCommand(id, 2, false))

    expect(seen).toEqual([5, 5, 5])
  })

  it("fails closed when a create or an archive reaches its handler without the entitlement gate", async () => {
    const categories = new MemoryCategoryRepository()
    const groups = { roleOf: () => Promise.resolve(GroupRole.OWNER) }
    const id = uuidV7()
    await categories.create({ groupId, id, ...fields, allowance: null }, OWNER)

    await expect(createCategoryCreateHandler({ categories, groups })(createCommand()))
      .rejects.toThrow("without the entitlement gate")
    await expect(
      createCategoryArchiveHandler({ categories, groups })(archiveCommand(id, 1, true)),
    ).rejects.toThrow("without the entitlement gate")
    expect(await categories.count(groupId)).toBe(1)
  })
})
