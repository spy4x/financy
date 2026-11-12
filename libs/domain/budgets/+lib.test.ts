import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import {
  type EntryRateLookup,
  type Ledger,
  type LedgerCategory,
  type LedgerRow,
  summarizeLedger,
} from "@domain/transactions"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  assertBudgetCategory,
  assertCanReadBudgets,
  assertCanWriteBudgets,
  BUDGET_AMOUNT_MAX,
  BudgetBand,
  budgetBand,
  type BudgetCategory,
  type BudgetLimit,
  BudgetLimitSource,
  budgetMonth,
  budgetMonthPayloadSchema,
  budgetSetPayloadSchema,
  parseBudgetRequest,
} from "./+lib.ts"

const groupId = "019a5b0e-1af5-7f04-8ae4-b1ee5d111002"
const food = "019a5b0e-1af5-7f04-8ae4-b1ee5d114001"
const groceries = "019a5b0e-1af5-7f04-8ae4-b1ee5d114002"
const cafes = "019a5b0e-1af5-7f04-8ae4-b1ee5d114003"
const rent = "019a5b0e-1af5-7f04-8ae4-b1ee5d114004"
const setPayload = {
  groupId,
  categoryId: food,
  month: "2026-11",
  amount: 50000,
  currency: "EUR",
  expectedVersion: null,
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

function rate(base: string, quote: string, value: string, date: string): ExchangeRate {
  return { base, quote, rate: value, date, source: "test" }
}

/** The household's categories as the ledger sorts them: Food with two children, and Rent. */
const LEDGER_CATEGORIES: LedgerCategory[] = [
  { id: food, kind: CategoryKind.EXPENSE, parentId: null },
  { id: groceries, kind: CategoryKind.EXPENSE, parentId: food },
  { id: cafes, kind: CategoryKind.EXPENSE, parentId: food },
  { id: rent, kind: CategoryKind.EXPENSE, parentId: null },
]
const CATEGORIES: BudgetCategory[] = LEDGER_CATEGORIES.map(({ id, parentId }) => ({ id, parentId }))

/**
 * The month's readers over `rows`, through the real ledger summary, and the rate lookups made.
 * Rates are keyed `BASE:QUOTE:DATE`; the ledger asks for the latest earlier day's, as Postgres
 * does, here only the exact day.
 */
function readers(rows: LedgerRow[], rates: Record<string, string> = {}) {
  const ledgerCalls: string[] = []
  const rateCalls: string[] = []
  const lookup: EntryRateLookup = (base, quote, date) => {
    rateCalls.push(`${base}:${quote}:${date}`)
    const value = rates[`${base}:${quote}:${date}`]
    return Promise.resolve(value === undefined ? null : rate(base, quote, value, date))
  }
  return {
    ledgerCalls,
    rateCalls,
    ledger: (currency: string): Promise<Ledger> => {
      ledgerCalls.push(currency)
      return summarizeLedger(rows, LEDGER_CATEGORIES, {
        currency,
        from: "2026-11-01",
        to: "2026-11-30",
      }, lookup)
    },
    rate: lookup,
  }
}

function november(limits: Record<string, BudgetLimit>, today = "2026-12-05") {
  return {
    month: "2026-11",
    from: "2026-11-01",
    to: "2026-11-30",
    today,
    baseCurrency: "EUR",
    categories: CATEGORIES,
    limits: new Map(Object.entries(limits)),
  }
}

const eur = (amount: number): BudgetLimit => ({ amount, currency: "EUR" })
const spent = (categoryId: string, amount: number, currency = "EUR", date = "2026-11-10") => ({
  categoryId,
  currency,
  date,
  amount: -amount,
})

describe("the band of a bar (R15)", () => {
  it("turns yellow at 80%, orange at 95%, stays orange at exactly 100% and turns red past it", () => {
    const bands = [79, 80, 94, 95, 100, 101].map((spending) => budgetBand(spending, 100))

    expect(bands).toEqual([
      { band: BudgetBand.GREEN, percent: 79 },
      { band: BudgetBand.YELLOW, percent: 80 },
      { band: BudgetBand.YELLOW, percent: 94 },
      { band: BudgetBand.ORANGE, percent: 95 },
      { band: BudgetBand.ORANGE, percent: 100 },
      { band: BudgetBand.RED, percent: 101 },
    ])
  })

  it("reads 100.01% as red though the whole percent says 100, and 79.99% as green", () => {
    expect(budgetBand(10001, 10000)).toEqual({ band: BudgetBand.RED, percent: 100 })
    expect(budgetBand(7999, 10000)).toEqual({ band: BudgetBand.GREEN, percent: 79 })
  })

  it("reports a whole percent rounded down, and refunds past the spending as 0%", () => {
    expect(budgetBand(41200, 50000)).toEqual({ band: BudgetBand.YELLOW, percent: 82 })
    expect(budgetBand(-500, 50000)).toEqual({ band: BudgetBand.GREEN, percent: 0 })
  })

  it("compares the largest safe amounts exactly, where one unit past the limit is red", () => {
    expect(budgetBand(BUDGET_AMOUNT_MAX, BUDGET_AMOUNT_MAX)).toEqual({
      band: BudgetBand.ORANGE,
      percent: 100,
    })
    expect(budgetBand(BUDGET_AMOUNT_MAX - 1, BUDGET_AMOUNT_MAX - 2)).toEqual({
      band: BudgetBand.RED,
      percent: 100,
    })
  })
})

describe("the budget.set payload", () => {
  it("takes a month's limit, a removal, and no currency for the base currency", () => {
    const { currency: _currency, ...noCurrency } = setPayload
    expect(parseBudgetRequest(budgetSetPayloadSchema, setPayload)).toEqual(setPayload)
    expect(parseBudgetRequest(budgetSetPayloadSchema, noCurrency)).toEqual(noCurrency)
    expect(
      parseBudgetRequest(budgetSetPayloadSchema, {
        ...noCurrency,
        amount: null,
        expectedVersion: 2,
      }),
    ).toMatchObject({ amount: null, expectedVersion: 2 })
  })

  it("refuses a month that is not YYYY-MM, a day, or year 0", () => {
    for (const month of ["2026-13", "2026-00", "2026-1", "2026-11-01", "0000-01", "Nov 2026"]) {
      expect(codeOf(() => parseBudgetRequest(budgetSetPayloadSchema, { ...setPayload, month })))
        .toBe("INVALID_REQUEST")
    }
  })

  it("refuses an amount of zero, below zero, fractional or past the safe range", () => {
    for (const amount of [0, -1, 12.5, BUDGET_AMOUNT_MAX + 2, "500"]) {
      expect(codeOf(() => parseBudgetRequest(budgetSetPayloadSchema, { ...setPayload, amount })))
        .toBe("INVALID_REQUEST")
    }
  })

  it("refuses a currency the money table does not know, and a currency with no amount", () => {
    const answers = [
      { ...setPayload, currency: "ABC" },
      { ...setPayload, currency: "BTC" },
      { ...setPayload, currency: "eur" },
      { ...setPayload, amount: null },
    ].map((payload) => codeOf(() => parseBudgetRequest(budgetSetPayloadSchema, payload)))

    expect(answers).toEqual(Array(4).fill("INVALID_REQUEST"))
  })

  it("refuses a missing or zero expected version, and every field the server sets", () => {
    const { expectedVersion: _version, ...noVersion } = setPayload
    for (
      const payload of [
        noVersion,
        { ...setPayload, expectedVersion: 0 },
        { ...setPayload, id: groupId },
        { ...setPayload, createdByUserId: 1 },
      ]
    ) {
      expect(codeOf(() => parseBudgetRequest(budgetSetPayloadSchema, payload)))
        .toBe("INVALID_REQUEST")
    }
  })

  it("takes a month read with or without a month, and refuses a day or a range", () => {
    expect(parseBudgetRequest(budgetMonthPayloadSchema, { groupId })).toEqual({ groupId })
    expect(parseBudgetRequest(budgetMonthPayloadSchema, { groupId, month: "2026-10" }))
      .toEqual({ groupId, month: "2026-10" })
    expect(
      codeOf(() => parseBudgetRequest(budgetMonthPayloadSchema, { groupId, month: "2026-10-01" })),
    )
      .toBe("INVALID_REQUEST")
    expect(codeOf(() =>
      parseBudgetRequest(budgetMonthPayloadSchema, {
        groupId,
        from: "2026-01-01",
        to: "2026-12-31",
      })
    )).toBe("INVALID_REQUEST")
  })
})

describe("who may set a budget, and on which category", () => {
  it("lets every member read, an editor and above write, and tells a stranger nothing (R16)", () => {
    expect(codeOf(() => assertCanReadBudgets(GroupRole.VIEWER))).toBeUndefined()
    expect(codeOf(() => assertCanWriteBudgets(GroupRole.EDITOR))).toBeUndefined()
    expect(codeOf(() => assertCanWriteBudgets(GroupRole.VIEWER))).toBe("ROLE_INSUFFICIENT")
    expect(codeOf(() => assertCanReadBudgets(null))).toBe("GROUP_NOT_FOUND")
    expect(codeOf(() => assertCanWriteBudgets(null))).toBe("GROUP_NOT_FOUND")
  })

  it("refuses an unknown category, an income category (R12), and a new amount on an archived one", () => {
    const expense = { kind: CategoryKind.EXPENSE, archived: false }
    expect(codeOf(() => assertBudgetCategory(null, 500))).toBe("CATEGORY_NOT_FOUND")
    expect(codeOf(() => assertBudgetCategory({ ...expense, kind: CategoryKind.INCOME }, 500)))
      .toBe("BUDGET_INCOME_CATEGORY")
    expect(codeOf(() => assertBudgetCategory({ ...expense, kind: CategoryKind.INCOME }, null)))
      .toBe("BUDGET_INCOME_CATEGORY")
    expect(codeOf(() => assertBudgetCategory({ ...expense, archived: true }, 500)))
      .toBe("CATEGORY_ARCHIVED")
    expect(codeOf(() => assertBudgetCategory({ ...expense, archived: true }, null)))
      .toBeUndefined()
    expect(codeOf(() => assertBudgetCategory(expense, 500))).toBeUndefined()
  })
})

describe("a month of bars", () => {
  it("fills both Food at 500 and its child Groceries at 300 with a 50 entry in Groceries (R13)", async () => {
    const month = await budgetMonth(
      november({ [food]: eur(50000), [groceries]: eur(30000) }),
      readers([spent(groceries, 5000)]),
    )

    expect(month.rows.slice(0, 2)).toEqual([
      {
        categoryId: food,
        parentId: null,
        limit: eur(50000),
        source: BudgetLimitSource.OWN,
        spending: 5000,
        currency: "EUR",
        band: BudgetBand.GREEN,
        percent: 10,
        leftOut: [],
      },
      {
        categoryId: groceries,
        parentId: food,
        limit: eur(30000),
        source: BudgetLimitSource.OWN,
        spending: 5000,
        currency: "EUR",
        band: BudgetBand.GREEN,
        percent: 16,
        leftOut: [],
      },
    ])
  })

  it("compares a parent without its own limit with its children's, 300 for Food (R13)", async () => {
    const month = await budgetMonth(
      november({ [groceries]: eur(30000) }),
      readers([spent(groceries, 5000), spent(food, 25000)]),
    )

    expect(month.rows[0]).toMatchObject({
      categoryId: food,
      limit: eur(30000),
      source: BudgetLimitSource.CHILDREN,
      spending: 30000,
      band: BudgetBand.ORANGE,
      percent: 100,
    })
  })

  it("lists every parent followed by its children, and a child of an unlisted parent on its own", async () => {
    const orphan = "019a5b0e-1af5-7f04-8ae4-b1ee5d114099"
    const month = await budgetMonth(
      {
        ...november({}),
        categories: [
          { id: rent, parentId: null },
          { id: groceries, parentId: food },
          { id: food, parentId: null },
          { id: orphan, parentId: "019a5b0e-1af5-7f04-8ae4-b1ee5d114098" },
          { id: cafes, parentId: food },
        ],
      },
      readers([]),
    )

    expect(month.rows.map((row) => row.categoryId)).toEqual([rent, food, groceries, cafes, orphan])
  })

  it("counts the month's expenses less its refunds, and shows a bar with no limit in the base currency (R15)", async () => {
    const month = await budgetMonth(
      november({ [groceries]: eur(10000) }),
      readers([
        spent(groceries, 9000),
        { categoryId: groceries, currency: "EUR", date: "2026-11-12", amount: 1500 },
        spent(rent, 80000),
      ]),
    )

    expect(month.rows.find((row) => row.categoryId === groceries)).toMatchObject({
      spending: 7500,
      band: BudgetBand.GREEN,
      percent: 75,
    })
    expect(month.rows.find((row) => row.categoryId === rent)).toEqual({
      categoryId: rent,
      parentId: null,
      limit: null,
      source: null,
      spending: 80000,
      currency: "EUR",
      band: null,
      percent: null,
      leftOut: [],
    })
  })

  it("shows spending in the limit's currency, each entry at its date's rate, and reads each currency's ledger once", async () => {
    const r = readers(
      [spent(rent, 50000, "EUR", "2026-11-03"), spent(cafes, 10000, "EUR", "2026-11-20")],
      { "EUR:USD:2026-11-03": "1.1", "EUR:USD:2026-11-20": "1.2" },
    )
    const month = await budgetMonth(
      november({ [rent]: { amount: 100000, currency: "USD" }, [cafes]: eur(20000) }),
      r,
    )

    expect(month.rows.find((row) => row.categoryId === rent)).toMatchObject({
      currency: "USD",
      spending: 55000,
      percent: 55,
    })
    expect(month.rows.find((row) => row.categoryId === cafes)).toMatchObject({
      currency: "EUR",
      spending: 10000,
    })
    expect(r.ledgerCalls.sort()).toEqual(["EUR", "USD"])
  })

  it("sums children's limits in mixed currencies in the base currency at the month's last day, and names a rateless one (R13, R8)", async () => {
    const r = readers([spent(groceries, 6000)], { "USD:EUR:2026-11-30": "0.9" })
    const month = await budgetMonth(
      november({
        [groceries]: { amount: 10000, currency: "USD" },
        [cafes]: { amount: 5000, currency: "EUR" },
        [rent]: eur(1),
      }),
      r,
    )
    const withJpy = await budgetMonth(
      november({
        [groceries]: { amount: 10000, currency: "USD" },
        [cafes]: { amount: 5000, currency: "JPY" },
      }),
      readers([spent(groceries, 6000)], { "USD:EUR:2026-11-30": "0.9" }),
    )

    expect(month.rows[0]).toMatchObject({
      categoryId: food,
      limit: eur(14000),
      source: BudgetLimitSource.CHILDREN,
      spending: 6000,
      leftOut: [],
    })
    expect(r.rateCalls).toContain("USD:EUR:2026-11-30")
    expect(withJpy.rows[0]).toMatchObject({ limit: eur(9000), leftOut: ["JPY"] })
  })

  it("converts children's limits at today's rate while the month runs", async () => {
    const r = readers([], { "USD:EUR:2026-11-14": "0.9" })
    const month = await budgetMonth(
      november({
        [groceries]: { amount: 10000, currency: "USD" },
        [cafes]: { amount: 5000, currency: "EUR" },
      }, "2026-11-14"),
      r,
    )

    expect(r.rateCalls).toEqual(["USD:EUR:2026-11-14"])
    expect(month.rows[0].limit).toEqual(eur(14000))
  })

  it("keeps children's limits in their one shared currency, without a rate", async () => {
    const r = readers([])
    const month = await budgetMonth(
      november({
        [groceries]: { amount: 10000, currency: "USD" },
        [cafes]: { amount: 5000, currency: "USD" },
      }),
      r,
    )

    expect(month.rows[0].limit).toEqual({ amount: 15000, currency: "USD" })
    expect(r.rateCalls).toEqual([])
  })

  it("draws no bar for a parent whose every child limit lacks a rate, and names it", async () => {
    const month = await budgetMonth(
      november({
        [groceries]: { amount: 10000, currency: "USD" },
        [cafes]: { amount: 5000, currency: "JPY" },
      }),
      readers([]),
    )

    expect(month.rows[0]).toMatchObject({
      limit: null,
      source: BudgetLimitSource.CHILDREN,
      band: null,
      leftOut: ["JPY", "USD"],
    })
  })

  it("names a spending currency with no rate, never counting it as zero (R8)", async () => {
    const month = await budgetMonth(
      november({ [rent]: eur(100000) }),
      readers([spent(rent, 50000), spent(rent, 9000, "JPY")]),
    )

    expect(month.rows.find((row) => row.categoryId === rent)).toMatchObject({
      spending: 50000,
      leftOut: ["JPY"],
    })
  })

  it("shows no spending and no band when the month's sum is past the safe range", async () => {
    const month = await budgetMonth(
      november({ [rent]: eur(100000) }),
      readers([
        spent(rent, BUDGET_AMOUNT_MAX),
        spent(rent, BUDGET_AMOUNT_MAX, "EUR", "2026-11-11"),
      ]),
    )

    expect(month.rows.find((row) => row.categoryId === rent)).toMatchObject({
      spending: null,
      band: null,
      percent: null,
    })
  })
})
