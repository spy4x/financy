import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import {
  BUDGET_WIDGET_OPERATION,
  BudgetMonthQuery,
  BudgetWidgetQuery,
  type BudgetWidgetResult,
} from "@domain/budgets"
import { type Category, CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { TransactionKind } from "@domain/transactions"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { type MemoryBudgetCategory, MemoryBudgetRepository } from "../../_testing/memory-budgets.ts"
import { MemoryTransactionRepository } from "../../_testing/memory-transactions.ts"
import { createBudgetMonthHandler, createBudgetWidgetHandler } from "./handlers.ts"
import { createBudgetOperations } from "./operations.ts"

/**
 * The overview's budgets widget over in-memory budgets and entries: it answers what `budget.month`
 * answers for the month the range ends in, never past the household's current month, names only
 * this household's categories, and a stranger reads nothing. The SQL is in
 * `tests/integration/budgets-overview.integration.test.ts`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const usdAccount = uuidV7()
const otherAccount = uuidV7()
const food = uuidV7()
const groceries = uuidV7()
const rent = uuidV7()
const salary = uuidV7()
const otherFood = uuidV7()
const OWNER = 1
const VIEWER = 2
const STRANGER = 9
const NAMES: Record<string, string> = {
  [food]: "Food",
  [groceries]: "Groceries",
  [rent]: "Rent",
  [salary]: "Salary",
  [otherFood]: "Their food",
}
/** 05:00 UTC on 16 November: noon in Ho Chi Minh City, the household's zone. */
const NOV_16 = new Date("2026-11-16T05:00:00.000Z")

function household(now = NOV_16) {
  const roles: Record<string, GroupRole> = {
    [`${groupId}:${OWNER}`]: GroupRole.OWNER,
    [`${groupId}:${VIEWER}`]: GroupRole.VIEWER,
    [`${otherGroupId}:${OWNER}`]: GroupRole.OWNER,
  }
  const categoryMap = new Map<string, MemoryBudgetCategory>([
    [food, { groupId, kind: CategoryKind.EXPENSE }],
    [groceries, { groupId, kind: CategoryKind.EXPENSE, parentId: food }],
    [rent, { groupId, kind: CategoryKind.EXPENSE }],
    [salary, { groupId, kind: CategoryKind.INCOME }],
    [otherFood, { groupId: otherGroupId, kind: CategoryKind.EXPENSE }],
  ])
  const timeZones = new Map([
    [groupId, "Asia/Ho_Chi_Minh"],
    [otherGroupId, "Asia/Ho_Chi_Minh"],
  ])
  const budgets = new MemoryBudgetRepository(categoryMap, timeZones)
  const transactions = new MemoryTransactionRepository({
    accounts: new Map([
      [usdAccount, { groupId, currency: "USD" }],
      [otherAccount, { groupId: otherGroupId, currency: "USD" }],
    ]),
    categories: categoryMap,
    timeZones,
    rates: () => Promise.resolve(null),
  })
  const reads: string[] = []
  const categories = {
    list: (group: string): Promise<Category[]> => {
      reads.push(`categories`)
      return Promise.resolve(
        [...categoryMap].filter(([, category]) => category.groupId === group).map((
          [id, category],
        ) => ({
          id,
          groupId: category.groupId,
          name: NAMES[id],
          kind: category.kind,
          icon: "tag",
          color: "#336699",
          parentId: category.parentId ?? null,
          aliases: [],
          archivedAt: null,
          version: 1,
          changeSequence: "1",
          createdByUserId: null,
          updatedByUserId: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })),
      )
    },
  }
  const dependencies = {
    budgets: Object.assign(Object.create(budgets), {
      timeZoneOf: (group: string) => {
        reads.push(`timeZone`)
        return budgets.timeZoneOf(group)
      },
    }) as MemoryBudgetRepository,
    groups: {
      roleOf: (group: string, user: number) => Promise.resolve(roles[`${group}:${user}`] ?? null),
    },
    settings: { get: () => Promise.resolve({ baseCurrency: "USD" }) },
    ledger: (group: string, currency: string, from: string, to: string) => {
      reads.push(`ledger ${from}..${to}`)
      return transactions.ledger(group, currency, from, to)
    },
    ledgerMonths: (group: string, currency: string, from: string, to: string) =>
      transactions.ledgerMonths(group, currency, from, to),
    rate: () => Promise.resolve(null),
    now: () => now,
  }
  const widget = createBudgetWidgetHandler({ ...dependencies, categories })
  const month = createBudgetMonthHandler(dependencies)
  const actor = (userId: number) => ({ userId }) as BudgetWidgetQuery["data"]["actor"]
  const read = (range: { from: string; to: string }, userId = OWNER, group = groupId) =>
    widget(
      new BudgetWidgetQuery({ actor: actor(userId), groupId: group, ...range, timeZone: "UTC" }),
    )
  const screen = async (at?: string, group = groupId) =>
    (await month(new BudgetMonthQuery({ actor: actor(OWNER), groupId: group, month: at })))
      .budgets
  const limit = (categoryId: string, at: string, amount: number, group = groupId) =>
    budgets.set({
      groupId: group,
      categoryId,
      month: at,
      amount,
      currency: "USD",
      expectedVersion: null,
    }, OWNER)
  const spend = (categoryId: string, amount: number, date: string, group = groupId) =>
    transactions.create({
      groupId: group,
      id: uuidV7(),
      accountId: group === groupId ? usdAccount : otherAccount,
      categoryId,
      kind: TransactionKind.EXPENSE,
      amount,
      currency: "USD",
      memo: "",
      date,
      allowance: null,
    }, OWNER)
  return { read, screen, limit, spend, reads }
}

describe("the overview's budgets widget", () => {
  it("answers exactly what the Budgets screen reads for the month the range ends in", async () => {
    const h = household()
    await h.limit(food, "2026-09", 50000)
    await h.limit(rent, "2026-10", 120000)
    await h.spend(groceries, 58000, "2026-10-31")
    await h.spend(rent, 100000, "2026-10-01")
    await h.spend(food, 9999, "2026-11-01")

    const answer = await h.read({ from: "2026-10-01", to: "2026-10-31" })

    expect(answer.budgets).toEqual(await h.screen("2026-10"))
    expect(answer.budgets.month).toBe("2026-10")
    expect(answer.budgets.rows.find((row) => row.categoryId === food)?.spending).toBe(58000)
  })

  it("shows this month for a year range, and never a month after it", async () => {
    const h = household()
    await h.limit(food, "2026-11", 50000)

    const year = await h.read({ from: "2026-01-01", to: "2026-12-31" })
    const later = await h.read({ from: "2026-12-01", to: "2027-01-31" })

    expect(year.budgets).toEqual(await h.screen())
    expect(year.budgets.month).toBe("2026-11")
    expect(later.budgets.month).toBe("2026-11")
  })

  it("starts the new month at midnight on the 1st in the household's zone, whatever zone is sent", async () => {
    // 17:30 UTC on 30 November is 00:30 on 1 December in Ho Chi Minh City; the payload says UTC.
    const h = household(new Date("2026-11-30T17:30:00.000Z"))

    const year = await h.read({ from: "2026-01-01", to: "2026-12-31" })

    expect(year.budgets.month).toBe("2026-12")
  })

  it("names the month's categories of this household only, with their place in the tree", async () => {
    const h = household()

    const answer: BudgetWidgetResult = await h.read({ from: "2026-11-01", to: "2026-11-30" })

    expect(answer.categories.map(({ id, name, parentId }) => ({ id, name, parentId }))).toEqual([
      { id: food, name: "Food", parentId: null },
      { id: groceries, name: "Groceries", parentId: food },
      { id: rent, name: "Rent", parentId: null },
    ])
  })

  it("never counts another household's limits or spending", async () => {
    const h = household()
    await h.limit(food, "2026-11", 50000)
    await h.limit(otherFood, "2026-11", 1000, otherGroupId)
    await h.spend(otherFood, 70000, "2026-11-10", otherGroupId)

    const answer = await h.read({ from: "2026-11-01", to: "2026-11-30" })

    expect(answer.budgets.rows.map((row) => row.categoryId)).toEqual([food, groceries, rent])
    expect(answer.budgets.rows.map((row) => row.spending)).toEqual([0, 0, 0])
  })

  it("lets a viewer read, and tells a stranger the household does not exist before reading anything", async () => {
    const h = household()
    const range = { from: "2026-11-01", to: "2026-11-30" }

    expect((await h.read(range, VIEWER)).budgets.month).toBe("2026-11")
    h.reads.length = 0
    const refusal = await h.read(range, STRANGER).then(() => null, (error) => error)
    const elsewhere = await h.read(range, OWNER, uuidV7()).then(() => null, (error) => error)

    expect(refusal).toMatchObject({ code: "GROUP_NOT_FOUND" })
    expect(elsewhere).toMatchObject({ code: "GROUP_NOT_FOUND" })
    expect(h.reads).toEqual([])
  })

  it("reads one month of the ledger for a year range", async () => {
    const h = household()
    await h.limit(food, "2026-11", 50000)
    h.reads.length = 0

    await h.read({ from: "2025-11-17", to: "2026-11-16" })

    expect(h.reads.filter((entry) => entry.startsWith(`ledger`))).toEqual([
      `ledger 2026-11-01..2026-11-30`,
    ])
  })
})

describe("the budgets widget's operation", () => {
  const operations = createBudgetOperations(
    {
      widget: (query) => Promise.resolve({ budgets: query.data } as unknown as BudgetWidgetResult),
    } as Parameters<typeof createBudgetOperations>[0],
  )
  const handle = (payload: unknown) =>
    operations[BUDGET_WIDGET_OPERATION].handle(
      { actor: { userId: OWNER }, payload } as Parameters<
        (typeof operations)[string]["handle"]
      >[0],
    )
  const base = { groupId, from: "2026-11-01", to: "2026-11-30", timeZone: "Asia/Ho_Chi_Minh" }

  it("passes on the overview's widget payload, a 366-day range included", async () => {
    const year = { ...base, from: "2024-01-01", to: "2024-12-31" }

    expect(await handle(base)).toMatchObject({ budgets: base })
    expect(await handle(year)).toMatchObject({ budgets: year })
  })

  it("refuses an unknown zone, a range that runs backwards or past a year, garbage and an extra field", async () => {
    for (
      const payload of [
        { ...base, timeZone: "Mars/Olympus" },
        { ...base, from: "2026-11-30", to: "2026-11-01" },
        { ...base, from: "2025-01-01", to: "2026-11-30" },
        { ...base, from: "yesterday" },
        { ...base, extra: 1 },
        "garbage",
        null,
      ]
    ) {
      expect(await Promise.resolve(handle(payload)).then(() => null, (error) => error))
        .toMatchObject({ code: "INVALID_REQUEST" })
    }
  })
})
