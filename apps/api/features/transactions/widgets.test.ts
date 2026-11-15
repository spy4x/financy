import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import {
  MONEY_WIDGET_OPERATION,
  type MoneyWidgetResult,
  TransactionKind,
  TransactionWidgetQuery,
} from "@domain/transactions"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { MemoryTransactionRepository } from "../../_testing/memory-transactions.ts"
import { createTransactionWidgetHandler } from "./handlers.ts"
import { createTransactionOperations } from "./operations.ts"

/**
 * The money widgets' read (Net, Income, Spending) over the in-memory twin of the entries: the
 * figures are the ledger read's, the previous period is read only when the household has entries
 * that old, and a stranger reads nothing. The SQL, and transfers that never reach the ledger, are in
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
const salary = uuidV7()
const otherFood = uuidV7()
const OWNER = 1
const VIEWER = 2
const STRANGER = 9
const NOVEMBER = { from: "2026-11-01", to: "2026-11-30" }

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
    categories: new Map([
      [food, { groupId, kind: CategoryKind.EXPENSE }],
      [salary, { groupId, kind: CategoryKind.INCOME }],
      [otherFood, { groupId: otherGroupId, kind: CategoryKind.EXPENSE }],
    ]),
    timeZones: new Map([[groupId, "Asia/Ho_Chi_Minh"]]),
    rates,
  })
  const reads: string[] = []
  const counted = Object.assign(Object.create(transactions), {
    ledger: (...args: Parameters<typeof transactions.ledger>) => {
      reads.push(`ledger ${args[2]}..${args[3]}`)
      return transactions.ledger(...args)
    },
    firstDate: (group: string) => {
      reads.push(`firstDate`)
      return transactions.firstDate(group)
    },
  }) as MemoryTransactionRepository
  const handler = createTransactionWidgetHandler({
    transactions: counted,
    groups: { roleOf: (group, user) => Promise.resolve(roles[`${group}:${user}`] ?? null) },
    settings: { get: () => Promise.resolve({ baseCurrency: "EUR" }) },
    now: () => new Date("2026-11-30T12:00:00.000Z"),
  })
  const add = (
    accountId: string,
    currency: string,
    amount: number,
    date: string,
    kind = TransactionKind.EXPENSE,
    group = groupId,
  ) =>
    transactions.create({
      groupId: group,
      id: uuidV7(),
      accountId,
      categoryId: group === groupId ? (kind === TransactionKind.INCOME ? salary : food) : otherFood,
      kind,
      amount,
      currency,
      memo: "",
      date,
      allowance: null,
    }, OWNER)
  const read = (
    range: { from: string; to: string } = NOVEMBER,
    userId = OWNER,
    timeZone = "Asia/Ho_Chi_Minh",
  ): Promise<MoneyWidgetResult> =>
    handler({
      data: {
        actor: { userId } as TransactionWidgetQuery["data"]["actor"],
        groupId,
        ...range,
        timeZone,
      },
    } as TransactionWidgetQuery)
  return { transactions, reads, add, read }
}

describe("the money widgets' read", () => {
  it("gives each widget the ledger read's own figures for a month of EUR, USD and VND (legacy §4 item 2)", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 300000, "2026-11-01", TransactionKind.INCOME)
    await h.add(usdAccount, "USD", 5000, "2026-11-03")
    await h.add(vndAccount, "VND", 2_000_000, "2026-11-10")
    await h.add(eurAccount, "EUR", 1200, "2026-11-12")

    const result = await h.read()
    const { categories: _categories, ...ledger } = await h.transactions.ledger(
      groupId,
      "EUR",
      NOVEMBER.from,
      NOVEMBER.to,
    )

    expect(result.current).toEqual(ledger)
    // 50.00 USD at 0.9 is 45.00 EUR; 2,000,000 VND at 0.000035 is 70.00 EUR.
    expect(result.current).toMatchObject({
      currency: "EUR",
      income: 300000,
      spending: 4500 + 7000 + 1200,
      net: 300000 - 12700,
    })
  })

  it("names a currency with no rate under its side and never counts it as zero (R8)", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, "2026-11-12")
    await h.add(thbAccount, "THB", 50000, "2026-11-13")

    const { current } = await h.read()

    expect(current.spending).toBe(1200)
    expect(current.spendingLeftOut).toEqual(["THB"])
    expect(current.incomeLeftOut).toEqual([])
  })

  it("carries the newest rate date with a converted figure, and none with nothing converted (R6)", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, "2026-11-20")
    expect((await h.read()).current.rateDate).toBeNull()

    await h.add(usdAccount, "USD", 5000, "2026-11-03")
    await h.add(usdAccount, "USD", 5000, "2026-11-14")
    expect((await h.read()).current.rateDate).toBe("2026-11-14")
  })

  it("counts an entry dated the 1st in that month whatever zone the device sends (R14)", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, "2026-11-01")

    for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]) {
      expect((await h.read(NOVEMBER, OWNER, zone)).current.spending).toBe(1200)
      expect(
        (await h.read({ from: "2026-10-01", to: "2026-10-31" }, OWNER, zone)).current.spending,
      ).toBe(0)
    }
  })

  it("reads the period of the same length before the range when the household has entries that old", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 800, "2026-10-17")
    await h.add(eurAccount, "EUR", 1200, "2026-11-10")

    const result = await h.read({ from: "2026-11-01", to: "2026-11-15" })

    expect(h.reads).toEqual([
      "firstDate",
      "ledger 2026-11-01..2026-11-15",
      "ledger 2026-10-17..2026-10-31",
    ])
    expect(result.previous).toMatchObject({ from: "2026-10-17", to: "2026-10-31", spending: 800 })
  })

  it("gives no previous period when the household's first entry is newer than its first day", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 800, "2026-10-18")

    const result = await h.read({ from: "2026-11-01", to: "2026-11-15" })

    expect(result.previous).toBeNull()
    expect(h.reads).toEqual(["firstDate", "ledger 2026-11-01..2026-11-15"])
  })

  it("lets a viewer read, and tells a stranger the household does not exist before reading anything", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, "2026-11-12")

    expect((await h.read(NOVEMBER, VIEWER)).current.spending).toBe(1200)
    h.reads.length = 0
    const refusal = await h.read(NOVEMBER, STRANGER).then(() => null, (error) => error)

    expect(refusal).toMatchObject({ code: "GROUP_NOT_FOUND" })
    expect(h.reads).toEqual([])
  })

  it("never counts another household's rows", async () => {
    const h = household()
    await h.add(eurAccount, "EUR", 1200, "2026-11-12")
    await h.add(otherAccount, "EUR", 99900, "2026-11-12", TransactionKind.EXPENSE, otherGroupId)

    expect((await h.read()).current).toMatchObject({ spending: 1200, income: 0 })
  })
})

describe("the money widgets' operation", () => {
  const operations = createTransactionOperations(
    {
      widget: (query) =>
        Promise.resolve({ current: query.data, previous: null } as unknown as MoneyWidgetResult),
    } as Parameters<typeof createTransactionOperations>[0],
  )
  const handle = (payload: unknown) =>
    operations[MONEY_WIDGET_OPERATION].handle(
      {
        actor: { userId: OWNER },
        payload,
      } as Parameters<(typeof operations)[string]["handle"]>[0],
    )

  it("passes on the overview's widget payload: the household, the days and the zone", async () => {
    const payload = { groupId, ...NOVEMBER, timeZone: "Asia/Ho_Chi_Minh" }

    expect(await handle(payload)).toMatchObject({ current: payload })
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
