import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { type Category, CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import {
  CATEGORY_WIDGET_OPERATION,
  CATEGORY_WIDGET_TOP,
  type CategoryWidgetResult,
  TransactionCategoryWidgetQuery,
  TransactionKind,
} from "@domain/transactions"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { MemoryTransactionRepository } from "../../_testing/memory-transactions.ts"
import { createTransactionCategoryWidgetHandler } from "./handlers.ts"
import { createTransactionOperations } from "./operations.ts"

/**
 * "Where did the money go?" over the in-memory twin of the entries: each figure is the ledger
 * read's, only top-level categories that spent are listed, and a stranger reads nothing. The SQL,
 * and transfers that never reach the ledger, are in
 * `tests/integration/money-overview.integration.test.ts`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const eurAccount = uuidV7()
const usdAccount = uuidV7()
const vndAccount = uuidV7()
const thbAccount = uuidV7()
const otherAccount = uuidV7()
const food = uuidV7()
const groceries = uuidV7()
const rent = uuidV7()
const travel = uuidV7()
const salary = uuidV7()
const otherFood = uuidV7()
/** Six more top-level expense categories, for "and N more". */
const extra = Array.from({ length: 6 }, () => uuidV7())
const OWNER = 1
const VIEWER = 2
const STRANGER = 9
const NOVEMBER = { from: "2026-11-01", to: "2026-11-30" }

const PLACES: Record<string, { group: string; kind: CategoryKind; parentId?: string }> = {
  [food]: { group: groupId, kind: CategoryKind.EXPENSE },
  [groceries]: { group: groupId, kind: CategoryKind.EXPENSE, parentId: food },
  [rent]: { group: groupId, kind: CategoryKind.EXPENSE },
  [travel]: { group: groupId, kind: CategoryKind.EXPENSE },
  [salary]: { group: groupId, kind: CategoryKind.INCOME },
  [otherFood]: { group: otherGroupId, kind: CategoryKind.EXPENSE },
  ...Object.fromEntries(extra.map((id) => [id, { group: groupId, kind: CategoryKind.EXPENSE }])),
}
const NAMES: Record<string, string> = {
  [food]: "Food",
  [groceries]: "Groceries",
  [rent]: "Rent",
  [travel]: "Travel",
  [salary]: "Salary",
  [otherFood]: "Their food",
  ...Object.fromEntries(extra.map((id, at) => [id, `Extra ${at + 1}`])),
}

/** USD at 0.9 EUR and VND at 0.000035 EUR, each day's own rate; THB has none. */
function rates(base: string, quote: string, date: string): Promise<ExchangeRate | null> {
  const value = { USD: "0.9", VND: "0.000035" }[base]
  return Promise.resolve(
    value === undefined || quote !== "EUR"
      ? null
      : { base, quote, rate: value, date, source: "test" },
  )
}

function household() {
  const roles: Record<string, GroupRole> = {
    [`${groupId}:${OWNER}`]: GroupRole.OWNER,
    [`${groupId}:${VIEWER}`]: GroupRole.VIEWER,
    [`${otherGroupId}:${OWNER}`]: GroupRole.OWNER,
  }
  const transactions = new MemoryTransactionRepository({
    accounts: new Map([
      [eurAccount, { groupId, currency: "EUR" }],
      [usdAccount, { groupId, currency: "USD" }],
      [vndAccount, { groupId, currency: "VND" }],
      [thbAccount, { groupId, currency: "THB" }],
      [otherAccount, { groupId: otherGroupId, currency: "EUR" }],
    ]),
    categories: new Map(
      Object.entries(PLACES).map(([id, place]) => [id, {
        groupId: place.group,
        kind: place.kind,
        parentId: place.parentId ?? null,
      }]),
    ),
    timeZones: new Map([[groupId, "Asia/Ho_Chi_Minh"]]),
    rates,
  })
  const reads: string[] = []
  /** Travel is archived: its name still shows. */
  const categories = {
    list: (group: string): Promise<Category[]> => {
      reads.push(`categories`)
      return Promise.resolve(
        Object.entries(PLACES).filter(([, place]) => place.group === group).map(([id, place]) => ({
          id,
          groupId: place.group,
          name: NAMES[id],
          kind: place.kind,
          icon: "tag",
          color: "#336699",
          parentId: place.parentId ?? null,
          aliases: [],
          archivedAt: id === travel ? new Date(0) : null,
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
  const counted = Object.assign(Object.create(transactions), {
    ledger: (...args: Parameters<typeof transactions.ledger>) => {
      reads.push(`ledger ${args[2]}..${args[3]}`)
      return transactions.ledger(...args)
    },
  }) as MemoryTransactionRepository
  const handler = createTransactionCategoryWidgetHandler({
    transactions: counted,
    groups: { roleOf: (group, user) => Promise.resolve(roles[`${group}:${user}`] ?? null) },
    settings: { get: () => Promise.resolve({ baseCurrency: "EUR" }) },
    categories,
    now: () => new Date("2026-11-30T12:00:00.000Z"),
  })
  const add = (
    accountId: string,
    currency: string,
    amount: number,
    categoryId: string,
    kind = TransactionKind.EXPENSE,
    date = "2026-11-12",
  ) =>
    transactions.create({
      groupId: PLACES[categoryId].group,
      id: uuidV7(),
      accountId,
      categoryId,
      kind,
      amount,
      currency,
      memo: "",
      date,
      allowance: null,
    }, OWNER)
  const read = (userId = OWNER): Promise<CategoryWidgetResult> =>
    handler({
      data: {
        actor: { userId } as TransactionCategoryWidgetQuery["data"]["actor"],
        groupId,
        ...NOVEMBER,
        timeZone: "Asia/Ho_Chi_Minh",
      },
    } as TransactionCategoryWidgetQuery)
  const ledger = () => transactions.ledger(groupId, "EUR", NOVEMBER.from, NOVEMBER.to)
  return { reads, add, read, ledger }
}

describe(`"Where did the money go?" read`, () => {
  it("gives each category the ledger read's own figure for a month of EUR, USD and VND, named even when archived", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 300000, salary, TransactionKind.INCOME)
    await h.add(usdAccount, "USD", 5000, food)
    await h.add(vndAccount, "VND", 2_000_000, rent)
    await h.add(eurAccount, "EUR", 1200, travel)

    const result = await h.read()
    const ledger = await h.ledger()

    for (const row of result.top) {
      expect(row.spending).toBe(
        ledger.categories.find((category) => category.categoryId === row.categoryId)?.spending,
      )
    }
    // 2,000,000 VND at 0.000035 is 70.00 EUR; 50.00 USD at 0.9 is 45.00 EUR.
    expect(result).toEqual({
      currency: "EUR",
      spending: ledger.spending,
      top: [
        { categoryId: rent, name: "Rent", spending: 7000 },
        { categoryId: food, name: "Food", spending: 4500 },
        { categoryId: travel, name: "Travel", spending: 1200 },
      ],
      more: 0,
      spendingLeftOut: [],
      spendingRateDate: "2026-11-12",
      tooLarge: false,
    })
    expect(ledger.spending).toBe(12700)
  })

  it("lets a refund lower its category, and drops a category whose refunds cover its spending", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 5000, food)
    await h.add(eurAccount, "EUR", 1500, food, TransactionKind.INCOME)
    await h.add(eurAccount, "EUR", 2000, rent)
    await h.add(eurAccount, "EUR", 2000, rent, TransactionKind.INCOME)

    const result = await h.read()

    expect(result.top).toEqual([{ categoryId: food, name: "Food", spending: 3500 }])
    expect(result.spending).toBe(3500)
  })

  it("shows a child's spending under its parent only", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1000, food)
    await h.add(eurAccount, "EUR", 4000, groceries)

    const result = await h.read()

    expect(result.top).toEqual([{ categoryId: food, name: "Food", spending: 5000 }])
    expect(result.spending).toBe(5000)
  })

  it(`lists the top ${CATEGORY_WIDGET_TOP} by spending, ties by id, and counts the rest as more`, async () => {
    const h = household()
    for (const [at, id] of extra.entries()) await h.add(eurAccount, "EUR", 1000 * (at + 1), id)
    await h.add(eurAccount, "EUR", 6000, food)

    const result = await h.read()
    const tied = [food, extra[5]].sort()

    expect(result.top.map((row) => row.categoryId)).toEqual([
      ...tied,
      extra[4],
      extra[3],
      extra[2],
    ])
    expect(result.more).toBe(2)
  })

  it("names a currency with no rate and never counts it as zero", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, food)
    await h.add(thbAccount, "THB", 50000, rent)

    const result = await h.read()

    expect(result.top).toEqual([{ categoryId: food, name: "Food", spending: 1200 }])
    expect(result.spendingLeftOut).toEqual(["THB"])
    expect(result.spendingRateDate).toBeNull()
  })

  it("lets a viewer read, and tells a stranger the household does not exist before reading anything", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, food)

    expect((await h.read(VIEWER)).top).toHaveLength(1)
    h.reads.length = 0
    const refusal = await h.read(STRANGER).then(() => null, (error) => error)

    expect(refusal).toMatchObject({ code: "GROUP_NOT_FOUND" })
    expect(h.reads).toEqual([])
  })

  it("never counts another household's rows", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, food)
    await h.add(otherAccount, "EUR", 99900, otherFood)

    const result = await h.read()

    expect(result.top).toEqual([{ categoryId: food, name: "Food", spending: 1200 }])
    expect(result.spending).toBe(1200)
  })

  it("reads only the range: no previous period", async () => {
    const h = household()
    await h.read()

    expect(h.reads.filter((read) => read.startsWith("ledger"))).toEqual([
      "ledger 2026-11-01..2026-11-30",
    ])
  })
})

describe(`"Where did the money go?" operation`, () => {
  const operations = createTransactionOperations(
    {
      categoryWidget: (query) => Promise.resolve(query.data as unknown as CategoryWidgetResult),
    } as Parameters<typeof createTransactionOperations>[0],
  )
  const handle = (payload: unknown) =>
    operations[CATEGORY_WIDGET_OPERATION].handle(
      {
        actor: { userId: OWNER },
        payload,
      } as Parameters<(typeof operations)[string]["handle"]>[0],
    )

  it("passes on the overview's widget payload: the household, the days and the zone", async () => {
    const payload = { groupId, ...NOVEMBER, timeZone: "Asia/Ho_Chi_Minh" }

    expect(await handle(payload)).toMatchObject(payload)
  })

  it("refuses an unknown zone, a range that runs backwards or past a year, and an extra field", async () => {
    const base = { groupId, ...NOVEMBER, timeZone: "Asia/Ho_Chi_Minh" }
    for (
      const payload of [
        { ...base, timeZone: "Mars/Olympus" },
        { ...base, from: "2026-11-30", to: "2026-11-01" },
        { ...base, from: "2025-01-01", to: "2026-11-30" },
        { ...base, extra: 1 },
      ]
    ) {
      expect(await Promise.resolve(handle(payload)).then(() => null, (error) => error))
        .toMatchObject({ code: "INVALID_REQUEST" })
    }
  })
})
