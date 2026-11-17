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
  summarizeLedgerMonths,
} from "@domain/transactions"
import { endOfMonth } from "@spy4x/time/date"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  assertBudgetCategory,
  assertBudgetFits,
  assertCanReadBudgets,
  assertCanSetBudgetMethod,
  assertCanWriteBudgets,
  BUDGET_AMOUNT_MAX,
  BUDGET_WIDGET_IDS,
  BUDGET_WIDGETS,
  budgetAllowance,
  type BudgetAssignment,
  BudgetBand,
  budgetBand,
  BudgetBoundError,
  type BudgetCategory,
  budgetExportProblems,
  type BudgetLimit,
  BudgetLimitSource,
  BudgetMethod,
  budgetMethodAt,
  budgetMethodExportProblems,
  budgetMethodSetPayloadSchema,
  type BudgetMonth,
  budgetMonth,
  budgetMonthPayloadSchema,
  budgetMovePayloadSchema,
  budgetMoveReferenceProblems,
  type BudgetMoveTotal,
  budgetReferenceProblems,
  type BudgetRow,
  budgetSetPayloadSchema,
  budgetStanding,
  budgetWidgetMonth,
  ENVELOPE_RUN_MAX_MONTHS,
  envelopeMonth,
  envelopeRunStart,
  parseBudgetExportEntry,
  parseBudgetMethodExportEntry,
  parseBudgetMoveExportEntry,
  parseBudgetRequest,
  parseBudgetWidgetRequest,
  rowsInExpenseCategories,
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
const CATEGORIES: BudgetCategory[] = LEDGER_CATEGORIES.map(({ id, parentId }) => ({
  id,
  parentId,
  archived: false,
}))
/** {@link CATEGORIES} with the given ones archived. */
const archiving = (...ids: string[]): BudgetCategory[] =>
  CATEGORIES.map((category) => ({ ...category, archived: ids.includes(category.id) }))

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
        allowance: { amount: 50000, currency: "EUR", leftOut: [] },
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
          { id: rent, parentId: null, archived: false },
          { id: groceries, parentId: food, archived: false },
          { id: food, parentId: null, archived: false },
          { id: orphan, parentId: "019a5b0e-1af5-7f04-8ae4-b1ee5d114098", archived: false },
          { id: cafes, parentId: food, archived: false },
        ],
      },
      readers([]),
    )

    expect(month.rows.map((row) => row.categoryId)).toEqual([rent, food, groceries, cafes, orphan])
  })

  it("leaves an archived child out of a parent whose limit comes from its children, limit and spending alike", async () => {
    const month = await budgetMonth(
      {
        ...november({ [groceries]: eur(30000), [cafes]: eur(20000) }),
        categories: archiving(cafes),
      },
      readers([spent(groceries, 5000), spent(cafes, 4000), spent(food, 1000)]),
    )

    expect(month.rows.map((row) => row.categoryId)).toEqual([food, groceries, rent])
    expect(month.rows[0]).toMatchObject({
      categoryId: food,
      limit: eur(30000),
      source: BudgetLimitSource.CHILDREN,
      spending: 6000,
      percent: 20,
    })
  })

  it("keeps an archived child's spending in a parent with its own limit", async () => {
    const month = await budgetMonth(
      {
        ...november({ [food]: eur(50000), [groceries]: eur(30000) }),
        categories: archiving(cafes),
      },
      readers([spent(groceries, 5000), spent(cafes, 4000), spent(food, 1000)]),
    )

    expect(month.rows[0]).toMatchObject({
      categoryId: food,
      limit: eur(50000),
      source: BudgetLimitSource.OWN,
      spending: 10000,
    })
  })

  it("keeps an archived child's spending in a parent with no limit, and never takes its limit", async () => {
    const month = await budgetMonth(
      { ...november({ [cafes]: eur(20000) }), categories: archiving(cafes) },
      readers([spent(groceries, 5000), spent(cafes, 4000), spent(food, 1000)]),
    )

    expect(month.rows[0]).toMatchObject({
      categoryId: food,
      limit: null,
      source: null,
      spending: 10000,
    })
  })

  it("draws a live child of an archived parent on its own, with its own spending", async () => {
    const month = await budgetMonth(
      { ...november({ [groceries]: eur(30000) }), categories: archiving(food) },
      readers([spent(groceries, 5000), spent(cafes, 4000), spent(food, 1000)]),
    )

    expect(month.rows.map((row) => row.categoryId)).toEqual([groceries, cafes, rent])
    expect(month.rows[0]).toMatchObject({ parentId: food, spending: 5000, percent: 16 })
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

describe("the budget.method.set and budget.move payloads", () => {
  const move = {
    id: "019a5b0e-1af5-7f04-8ae4-b1ee5d119001",
    groupId,
    month: "2026-11",
    fromCategoryId: rent,
    toCategoryId: food,
    amount: 1000,
  }

  it("takes either method with or without a version, and refuses another method or a month", () => {
    for (const method of [BudgetMethod.LIMITS, BudgetMethod.ENVELOPES]) {
      expect(
        parseBudgetRequest(budgetMethodSetPayloadSchema, { groupId, method, expectedVersion: 2 }),
      ).toEqual({ groupId, method, expectedVersion: 2 })
    }
    for (
      const payload of [
        { groupId, method: 3, expectedVersion: null },
        { groupId, method: BudgetMethod.ENVELOPES, expectedVersion: null, month: "2026-11" },
        { groupId, method: BudgetMethod.ENVELOPES },
      ]
    ) {
      expect(codeOf(() => parseBudgetRequest(budgetMethodSetPayloadSchema, payload))).toBe(
        "INVALID_REQUEST",
      )
    }
  })

  it("takes a move, and refuses one into the envelope it comes from", () => {
    expect(parseBudgetRequest(budgetMovePayloadSchema, move)).toEqual(move)
    let refusal: unknown
    try {
      parseBudgetRequest(budgetMovePayloadSchema, { ...move, toCategoryId: rent })
    } catch (error) {
      refusal = error
    }
    expect(refusal).toMatchObject({
      code: "INVALID_REQUEST",
      fields: { toCategoryId: { code: "same" } },
    })
  })

  it("refuses a move of zero, a fraction, past the safe range, or with an id that is no UUID", () => {
    for (
      const payload of [
        { ...move, amount: 0 },
        { ...move, amount: 0.5 },
        { ...move, amount: BUDGET_AMOUNT_MAX + 1 },
        { ...move, id: "move-1" },
        { ...move, currency: "EUR" },
      ]
    ) {
      expect(codeOf(() => parseBudgetRequest(budgetMovePayloadSchema, payload))).toBe(
        "INVALID_REQUEST",
      )
    }
  })
})

describe("who may switch the budgeting method", () => {
  it("lets an admin or the owner switch it, refuses an editor and a viewer, and tells a stranger nothing", () => {
    expect(codeOf(() => assertCanSetBudgetMethod(GroupRole.OWNER))).toBeUndefined()
    expect(codeOf(() => assertCanSetBudgetMethod(GroupRole.ADMIN))).toBeUndefined()
    expect(codeOf(() => assertCanSetBudgetMethod(GroupRole.EDITOR))).toBe("ROLE_INSUFFICIENT")
    expect(codeOf(() => assertCanSetBudgetMethod(GroupRole.VIEWER))).toBe("ROLE_INSUFFICIENT")
    expect(codeOf(() => assertCanSetBudgetMethod(null))).toBe("GROUP_NOT_FOUND")
  })
})

describe("a month's budgeting method", () => {
  const rows = [
    { month: "2026-11", method: BudgetMethod.ENVELOPES },
    { month: "2027-02", method: BudgetMethod.LIMITS },
    { month: "2027-05", method: BudgetMethod.ENVELOPES },
    { month: "2027-07", method: BudgetMethod.ENVELOPES },
  ]

  it("is monthly limits before the first switch, and the latest switch at or before a month after it", () => {
    expect(budgetMethodAt([], "2026-11")).toBe(BudgetMethod.LIMITS)
    expect(budgetMethodAt(rows, "2026-10")).toBe(BudgetMethod.LIMITS)
    expect(budgetMethodAt(rows, "2026-11")).toBe(BudgetMethod.ENVELOPES)
    expect(budgetMethodAt(rows, "2027-01")).toBe(BudgetMethod.ENVELOPES)
    expect(budgetMethodAt(rows, "2027-03")).toBe(BudgetMethod.LIMITS)
    expect(budgetMethodAt(rows, "2027-06")).toBe(BudgetMethod.ENVELOPES)
  })

  it("starts an envelope run at the switch after a month of limits, and keeps a second envelope row in it", () => {
    expect(envelopeRunStart(rows, "2026-10")).toBeNull()
    expect(envelopeRunStart(rows, "2027-01")).toBe("2026-11")
    expect(envelopeRunStart(rows, "2027-03")).toBeNull()
    expect(envelopeRunStart(rows, "2027-06")).toBe("2027-05")
    expect(envelopeRunStart([...rows].reverse(), "2027-09")).toBe("2027-05")
  })

  it("never walks back more than the cap", () => {
    const start = [{ month: "2020-01", method: BudgetMethod.ENVELOPES }]
    expect(ENVELOPE_RUN_MAX_MONTHS).toBe(60)
    expect(envelopeRunStart(start, "2024-12")).toBe("2020-01")
    expect(envelopeRunStart(start, "2025-01")).toBe("2020-02")
  })
})

describe("a month of envelopes", () => {
  const salary = "019a5b0e-1af5-7f04-8ae4-b1ee5d114005"
  const categories: LedgerCategory[] = [
    ...LEDGER_CATEGORIES,
    { id: salary, kind: CategoryKind.INCOME, parentId: null },
  ]
  const earned = (amount: number, date = "2026-11-01") => ({
    categoryId: salary,
    currency: "EUR",
    date,
    amount,
  })
  const assigned = (
    categoryId: string,
    amount: number,
    month = "2026-11",
    currency = "EUR",
  ): BudgetAssignment => ({ month, categoryId, amount, currency })
  const moved = (
    categoryId: string,
    movedIn: number,
    movedOut: number,
    month = "2026-11",
    currency = "EUR",
  ): BudgetMoveTotal => ({ month, categoryId, currency, movedIn, movedOut })

  /**
   * The last month of a run from `from` to `to` over `rows`, through the real ledger summary in
   * EUR. Each month converts at its last day's rate; rates are keyed `BASE:QUOTE:DATE`.
   */
  async function run(input: {
    from?: string
    to?: string
    rows?: LedgerRow[]
    assignments?: BudgetAssignment[]
    moves?: BudgetMoveTotal[]
    rates?: Record<string, string>
  }) {
    const lookup: EntryRateLookup = (base, quote, date) => {
      const value = input.rates?.[`${base}:${quote}:${date}`]
      return Promise.resolve(value === undefined ? null : rate(base, quote, value, date))
    }
    const from = input.from ?? "2026-11"
    const ledgers = await summarizeLedgerMonths(input.rows ?? [], categories, {
      currency: "EUR",
      from: `${from}-01`,
      to: endOfMonth(`${input.to ?? from}-01`),
    }, lookup)
    return await envelopeMonth({
      baseCurrency: "EUR",
      categories: CATEGORIES,
      months: ledgers.map((ledger) => ({
        month: ledger.from.slice(0, 7),
        ledger,
        rateDate: ledger.to,
      })),
      assignments: input.assignments ?? [],
      moves: input.moves ?? [],
    }, lookup)
  }

  it("rolls what an envelope left into the next month, and assigns each month only its own row", async () => {
    const december = await run({
      to: "2026-12",
      rows: [spent(rent, 20000), spent(rent, 10000, "EUR", "2026-12-03")],
      assignments: [assigned(rent, 50000)],
    })

    expect(december.envelopes.get(rent)).toEqual({
      assigned: 0,
      movedIn: 0,
      movedOut: 0,
      spent: 10000,
      available: 20000,
    })
  })

  it("shows an overspent envelope below zero, starts it at zero next month and takes the excess from ready to assign", async () => {
    const input = {
      rows: [earned(100000), spent(rent, 35000)],
      assignments: [assigned(rent, 30000), assigned(rent, 10000, "2026-12")],
    }

    const november = await run(input)
    const december = await run({ ...input, to: "2026-12" })

    expect(november.envelopes.get(rent)).toMatchObject({ available: -5000 })
    expect(november.readyToAssign).toBe(70000)
    expect(december.envelopes.get(rent)).toMatchObject({ assigned: 10000, available: 10000 })
    // 70000 carried, no income, 10000 assigned, 5000 overspent in November.
    expect(december.readyToAssign).toBe(55000)
  })

  it("moves money between envelopes without changing ready to assign", async () => {
    const month = await run({
      rows: [earned(100000)],
      assignments: [assigned(rent, 30000)],
      moves: [moved(rent, 0, 10000), moved(cafes, 10000, 0)],
    })

    expect(month.envelopes.get(rent)).toMatchObject({ movedOut: 10000, available: 20000 })
    expect(month.envelopes.get(cafes)).toMatchObject({ movedIn: 10000, available: 10000 })
    expect(month.readyToAssign).toBe(70000)
  })

  it("converts assignments and moves at the month's rate, entries at their day's, and names a currency with no rate (R8)", async () => {
    const month = await run({
      rows: [earned(10000), spent(rent, 4000, "USD", "2026-11-10")],
      assignments: [
        assigned(rent, 10000, "2026-11", "USD"),
        assigned(cafes, 1000, "2026-11", "JPY"),
      ],
      moves: [moved(rent, 2000, 0, "2026-11", "USD")],
      rates: { "USD:EUR:2026-11-30": "0.5", "USD:EUR:2026-11-10": "0.75" },
    })

    // Assigned 100 USD at 0.5 and moved in 20 USD at 0.5; spent 40 USD at 0.75.
    expect(month.envelopes.get(rent)).toEqual({
      assigned: 5000,
      movedIn: 1000,
      movedOut: 0,
      spent: 3000,
      available: 3000,
    })
    expect(month.envelopes.get(cafes)).toMatchObject({ assigned: 0, available: 0 })
    expect(month.readyToAssign).toBe(5000)
    expect(month.leftOut).toEqual(["JPY"])
  })

  it("rolls a parent's own envelope up with its children's, each with its own balance (R13)", async () => {
    const month = await run({
      rows: [spent(groceries, 6000), spent(food, 1000)],
      assignments: [assigned(food, 10000), assigned(groceries, 5000), assigned(cafes, 2000)],
    })

    expect(month.envelopes.get(groceries)).toMatchObject({ spent: 6000, available: -1000 })
    expect(month.envelopes.get(food)).toEqual({
      assigned: 17000,
      movedIn: 0,
      movedOut: 0,
      spent: 7000,
      available: 10000,
    })
  })

  it("carries each child's balance on its own, so a parent's overspent child starts the next month at zero", async () => {
    const december = await run({
      to: "2026-12",
      rows: [spent(groceries, 6000)],
      assignments: [assigned(food, 10000), assigned(groceries, 5000)],
    })

    expect(december.envelopes.get(groceries)).toMatchObject({ available: 0 })
    expect(december.envelopes.get(food)).toMatchObject({ available: 10000 })
    expect(december.readyToAssign).toBe(-16000)
  })

  it("makes every figure null when a sum in the run is past the safe range", async () => {
    const month = await run({
      rows: [spent(rent, BUDGET_AMOUNT_MAX), spent(rent, BUDGET_AMOUNT_MAX, "EUR", "2026-11-11")],
      assignments: [assigned(rent, 1000)],
    })

    expect(month.envelopes.get(rent)).toEqual({
      assigned: null,
      movedIn: null,
      movedOut: null,
      spent: null,
      available: null,
    })
    expect(month.readyToAssign).toBeNull()
  })
})

describe("budgets in a household's export file", () => {
  const stamps = { createdAt: "2026-11-05T10:00:00.000Z", updatedAt: "2026-11-05T10:00:00.000Z" }
  const budget = {
    id: "019a5b0e-1af5-7f04-8ae4-b1ee5d115001",
    categoryId: food,
    month: "2026-11",
    amount: 40000,
    currency: "EUR",
    ...stamps,
  }
  const move = {
    id: "019a5b0e-1af5-7f04-8ae4-b1ee5d115002",
    month: "2026-11",
    fromCategoryId: food,
    toCategoryId: groceries,
    amount: 2500,
    currency: "EUR",
    createdAt: stamps.createdAt,
  }
  const kinds: Record<string, CategoryKind> = {
    [food]: CategoryKind.EXPENSE,
    [groceries]: CategoryKind.EXPENSE,
    [rent]: CategoryKind.INCOME,
  }
  const inFile = (fileId: string) => kinds[fileId] ? { kind: kinds[fileId] } : null

  it("reads a limit and a removed limit with their dates", () => {
    expect(parseBudgetExportEntry(budget)).toEqual({
      ...budget,
      createdAt: new Date(stamps.createdAt),
      updatedAt: new Date(stamps.updatedAt),
    })
    expect(parseBudgetExportEntry({ ...budget, amount: null, currency: null })).toMatchObject({
      amount: null,
      currency: null,
    })
  })

  it("refuses an amount without a currency, a currency without an amount, a zero amount, an unknown field and a month that does not exist", () => {
    expect(() => parseBudgetExportEntry({ ...budget, currency: null })).toThrow(
      "the currency must be there exactly when the amount is",
    )
    expect(() => parseBudgetExportEntry({ ...budget, amount: null })).toThrow(
      "the currency must be there exactly when the amount is",
    )
    expect(() => parseBudgetExportEntry({ ...budget, amount: 0 })).toThrow("the amount")
    expect(() => parseBudgetExportEntry({ ...budget, version: 2 })).toThrow("does not have")
    expect(() => parseBudgetExportEntry({ ...budget, month: "2026-13" })).toThrow("the month")
  })

  it("reads a method row and refuses a method it does not know", () => {
    const method = { id: budget.id, month: "2026-11", method: BudgetMethod.ENVELOPES, ...stamps }
    expect(parseBudgetMethodExportEntry(method)).toMatchObject({ method: BudgetMethod.ENVELOPES })
    expect(() => parseBudgetMethodExportEntry({ ...method, method: 3 })).toThrow("the method")
  })

  it("reads an envelope move and refuses one into the envelope it comes from", () => {
    expect(parseBudgetMoveExportEntry(move)).toMatchObject({
      amount: 2500,
      toCategoryId: groceries,
    })
    expect(() => parseBudgetMoveExportEntry({ ...move, toCategoryId: food })).toThrow(
      "into the envelope it comes from",
    )
  })

  it("names a second budget row for one category and month, and a second method row for one month", () => {
    const later = { ...budget, month: "2026-12" }
    expect(budgetExportProblems([budget, later, budget, { ...budget, categoryId: groceries }]))
      .toEqual([{
        index: 2,
        problem: "another budget in the file has the same category and month",
        issue: { code: "duplicate", field: "month" },
      }])
    expect(budgetMethodExportProblems([{ month: "2026-11" }, { month: "2026-11" }]))
      .toMatchObject([{ index: 1, issue: { code: "duplicate", field: "month" } }])
  })

  it("names a budget whose category the file lacks, and not one whose category is an income category", () => {
    const missing = "019a5b0e-1af5-7f04-8ae4-b1ee5d119999"
    expect(
      budgetReferenceProblems(
        [budget, { categoryId: missing }, { categoryId: rent }],
        inFile,
      ).map(({ index, issue }) => ({ index, issue })),
    ).toEqual([{ index: 1, issue: { code: "notFound", field: "categoryId" } }])
  })

  it("keeps only the rows whose every category is an expense category", () => {
    const toIncome = { ...move, toCategoryId: rent }
    const fromIncome = { ...move, fromCategoryId: rent }
    expect(
      rowsInExpenseCategories(
        [move, toIncome, fromIncome],
        (row) => [row.fromCategoryId, row.toCategoryId],
        inFile,
      ),
    ).toEqual([move])
    expect(
      rowsInExpenseCategories(
        [budget, { ...budget, categoryId: rent }],
        (row) => [row.categoryId],
        inFile,
      ),
    ).toEqual([budget])
  })

  it("names an envelope move whose from or to category the file lacks", () => {
    const missing = "019a5b0e-1af5-7f04-8ae4-b1ee5d119999"
    expect(
      budgetMoveReferenceProblems(
        [move, { ...move, fromCategoryId: missing }, { ...move, toCategoryId: missing }],
        inFile,
      ).map(({ index, issue }) => ({ index, issue })),
    ).toEqual([
      { index: 1, issue: { code: "notFound", field: "fromCategoryId" } },
      { index: 2, issue: { code: "notFound", field: "toCategoryId" } },
    ])
  })
})

describe("the budgets widget on the overview", () => {
  it("is one full-width members-only widget under a stable id, seen by every member", () => {
    expect(BUDGET_WIDGETS.map((widget) => widget.id)).toEqual(["budgets.month"])
    expect(BUDGET_WIDGET_IDS.month).toBe("budgets.month")
    const [widget] = BUDGET_WIDGETS
    expect(widget.size).toBe("full")
    expect(widget.operatorView).toBe("never")
    expect(widget.operation).toBe("budget.widget.month")
    expect(
      [GroupRole.VIEWER, GroupRole.EDITOR, GroupRole.ADMIN, GroupRole.OWNER].map(widget.canView),
    )
      .toEqual([true, true, true, true])
  })
})

describe("the month the budgets widget shows", () => {
  const NOV_16 = new Date("2026-11-16T05:00:00.000Z")
  it("is the month of a range's last day when that day has passed", () => {
    expect(budgetWidgetMonth("2026-10-31", NOV_16, "UTC")).toBe("2026-10")
    expect(budgetWidgetMonth("2025-02-28", NOV_16, "UTC")).toBe("2025-02")
  })

  it("is this month for this year, or any range that ends later, never a future month", () => {
    expect(budgetWidgetMonth("2026-12-31", NOV_16, "UTC")).toBe("2026-11")
    expect(budgetWidgetMonth("2027-03-01", NOV_16, "UTC")).toBe("2026-11")
    expect(budgetWidgetMonth("2026-11-16", NOV_16, "UTC")).toBe("2026-11")
  })

  it("counts the month in the household's zone: past midnight on the 1st there, it is the new month", () => {
    // 17:30 UTC on 30 November is 00:30 on 1 December in Ho Chi Minh City.
    const now = new Date("2026-11-30T17:30:00.000Z")
    expect(budgetWidgetMonth("2026-12-31", now, "Asia/Ho_Chi_Minh")).toBe("2026-12")
    expect(budgetWidgetMonth("2026-12-31", now, "UTC")).toBe("2026-11")
  })
})

describe("the budgets widget payload", () => {
  const payload = { groupId, from: "2026-01-01", to: "2026-12-31", timeZone: "Asia/Singapore" }
  it("takes the overview's range of up to a year", () => {
    expect(parseBudgetWidgetRequest(payload)).toEqual(payload)
  })

  it("refuses a range that runs backwards, is past a year, is no date, an unknown zone or an extra field", () => {
    const refused = [
      { ...payload, from: "2026-12-31", to: "2026-01-01" },
      { ...payload, from: "2025-01-01", to: "2026-12-31" },
      { ...payload, to: "2026-02-30" },
      { ...payload, timeZone: "Mars/Olympus" },
      { ...payload, month: "2026-11" },
      { ...payload, groupId: "x" },
    ]
    expect(refused.map((value) => codeOf(() => parseBudgetWidgetRequest(value))))
      .toEqual(Array(refused.length).fill("INVALID_REQUEST"))
  })
})

describe("how a month's budgets stand", () => {
  const limitRow = (
    categoryId: string,
    spending: number | null,
    limit: number,
    extra: Partial<BudgetRow> = {},
  ): BudgetRow => {
    const banded = spending === null ? null : budgetBand(spending, limit)
    return {
      categoryId,
      parentId: null,
      limit: { amount: limit, currency: "USD" },
      source: BudgetLimitSource.OWN,
      spending,
      currency: "USD",
      band: banded?.band ?? null,
      percent: banded?.percent ?? null,
      leftOut: [],
      ...extra,
    }
  }
  const month = (rows: BudgetRow[], extra: Partial<BudgetMonth> = {}): BudgetMonth => ({
    month: "2026-11",
    from: "2026-11-01",
    to: "2026-11-30",
    baseCurrency: "USD",
    rows,
    method: BudgetMethod.LIMITS,
    methodVersion: null,
    ...extra,
  })

  it("counts every own limit as on track while none is past it, at exactly 100% too", () => {
    const standing = budgetStanding(month([limitRow(food, 100, 500), limitRow(rent, 500, 500)]))
    expect(standing).toEqual({ total: 2, onTrack: 2, over: [], leftOut: [], tooLarge: false })
  })

  it("names one over budget by how far past its limit it is", () => {
    const standing = budgetStanding(month([limitRow(food, 580, 500), limitRow(rent, 100, 500)]))
    expect(standing.onTrack).toBe(1)
    expect(standing.over).toEqual([{ categoryId: food, amount: 80, currency: "USD" }])
  })

  it("puts the most over first, by amount when every over one shares a currency", () => {
    const standing = budgetStanding(
      month([limitRow(food, 520, 500), limitRow(rent, 1300, 1000), limitRow(cafes, 90, 50)]),
    )
    expect(standing.total).toBe(3)
    expect(standing.onTrack).toBe(0)
    expect(standing.over.map((item) => [item.categoryId, item.amount])).toEqual([
      [rent, 300],
      [cafes, 40],
      [food, 20],
    ])
  })

  it("puts the most over first by share of its limit when the over ones are in different currencies", () => {
    const vnd = { limit: { amount: 1_000_000, currency: "VND" }, currency: "VND" }
    const standing = budgetStanding(
      month([limitRow(rent, 1_100_000, 1_000_000, vnd), limitRow(food, 600, 500)]),
    )
    // 120% of its limit before 110%, though 100,000 VND is the larger number.
    expect(standing.over.map((item) => item.categoryId)).toEqual([food, rent])
  })

  it("leaves out rows with no limit, and a parent whose limit is its children's sum", () => {
    const standing = budgetStanding(month([
      limitRow(food, 900, 800, { source: BudgetLimitSource.CHILDREN }),
      limitRow(groceries, 900, 800, { parentId: food }),
      { ...limitRow(rent, 50, 1), limit: null, source: null, band: null, percent: null },
    ]))
    expect(standing.total).toBe(1)
    expect(standing.over.map((item) => item.categoryId)).toEqual([groceries])
  })

  it("names the currencies a counted budget left out, and says when a figure was too large", () => {
    expect(budgetStanding(month([limitRow(food, 100, 500, { leftOut: ["THB", "EUR"] })])).leftOut)
      .toEqual(["EUR", "THB"])
    expect(budgetStanding(month([limitRow(food, null, 500)])).tooLarge).toBe(true)
  })

  it("counts nothing in a month with no budgets", () => {
    expect(budgetStanding(month([]))).toEqual({
      total: 0,
      onTrack: 0,
      over: [],
      leftOut: [],
      tooLarge: false,
    })
  })

  it("counts top-level envelopes that hold or moved money, over when below zero, the most over first", () => {
    const envelope = (available: number | null, assigned = 0, movedIn = 0, movedOut = 0) => ({
      assigned,
      movedIn,
      movedOut,
      spent: 0,
      available,
    })
    const row = (
      categoryId: string,
      env: BudgetRow["envelope"],
      parentId: string | null = null,
    ) => ({
      ...limitRow(categoryId, 0, 1),
      limit: null,
      source: null,
      band: null,
      percent: null,
      parentId,
      envelope: env,
    })
    const standing = budgetStanding(month([
      row(food, envelope(-30, 100)),
      row(groceries, envelope(-130, 0), food),
      row(rent, envelope(-200)),
      row(cafes, envelope(0)),
      row("019a5b0e-1af5-7f04-8ae4-b1ee5d114005", envelope(0, 0, 50, 50)),
    ], { method: BudgetMethod.ENVELOPES, envelopeLeftOut: ["THB"] }))
    // Groceries is in Food's envelope; Cafes holds nothing; the fifth moved money in and out.
    expect(standing.total).toBe(3)
    expect(standing.onTrack).toBe(1)
    expect(standing.over).toEqual([
      { categoryId: rent, amount: 200, currency: "USD" },
      { categoryId: food, amount: 30, currency: "USD" },
    ])
    expect(standing.leftOut).toEqual(["THB"])
    expect(
      budgetStanding(month([row(food, envelope(null, 5))], {
        method: BudgetMethod.ENVELOPES,
      })).tooLarge,
    ).toBe(true)
  })
})

describe("a subcategory's limit inside its parent's (R20)", () => {
  /** November's limits as `limitsAt` returns them, read on 5 December: rates of 30 November. */
  const family = (
    limits: Record<string, BudgetLimit>,
    categories: BudgetCategory[] = CATEGORIES,
  ) => ({ categories, limits: new Map(Object.entries(limits)), rateDate: "2026-11-30" })
  const usd = (amount: number): BudgetLimit => ({ amount, currency: "USD" })
  const RATES = { "USD:EUR:2026-11-30": "0.9" }
  /** The refusal `assertBudgetFits` throws, or `null` when it takes the limit. */
  async function refusal(
    categoryId: string,
    limit: BudgetLimit | null,
    limits: Record<string, BudgetLimit>,
    categories: BudgetCategory[] = CATEGORIES,
  ) {
    try {
      await assertBudgetFits(
        { categoryId, limit, ...family(limits, categories) },
        readers([], RATES).rate,
      )
      return null
    } catch (error) {
      if (!(error instanceof BudgetBoundError)) throw error
      return { code: error.code, bound: error.bound }
    }
  }

  it("leaves a child what its parent's own limit has after the other children's limits", async () => {
    const allowance = await budgetAllowance(
      cafes,
      family({ [food]: eur(30000), [groceries]: eur(20000), [cafes]: eur(5000) }),
      readers([]).rate,
    )

    expect(allowance).toEqual({ amount: 10000, currency: "EUR", leftOut: [] })
  })

  it("takes exactly the allowance and refuses one cent more, naming the allowance", async () => {
    const limits = { [food]: eur(30000), [groceries]: eur(20000) }

    expect(await refusal(cafes, eur(10000), limits)).toBeNull()
    expect(await refusal(cafes, eur(10001), limits)).toEqual({
      code: "BUDGET_OVER_PARENT",
      bound: { amount: 10000, currency: "EUR", leftOut: [] },
    })
  })

  it("puts no cap on a child whose parent has no limit of its own", async () => {
    const limits = { [groceries]: eur(20000) }

    expect(await budgetAllowance(cafes, family(limits), readers([]).rate)).toBeNull()
    expect(await refusal(cafes, eur(BUDGET_AMOUNT_MAX), limits)).toBeNull()
  })

  it("puts no cap on a child whose parent is archived, as the month shows it on its own", async () => {
    const limits = { [food]: eur(100), [groceries]: eur(20000) }

    expect(await refusal(cafes, eur(50000), limits, archiving(food))).toBeNull()
  })

  it("converts siblings and the asked amount to the parent's currency at the month's rate", async () => {
    const limits = { [food]: eur(30000), [groceries]: usd(20000) }

    expect(await budgetAllowance(cafes, family(limits), readers([], RATES).rate)).toEqual({
      amount: 12000,
      currency: "EUR",
      leftOut: [],
    })
    expect(await refusal(cafes, usd(13000), limits)).toBeNull()
    expect(await refusal(cafes, usd(14000), limits)).toMatchObject({
      code: "BUDGET_OVER_PARENT",
      bound: { amount: 12000, currency: "EUR" },
    })
  })

  it("leaves a sibling with no rate out of the sum and names its currency, never counting it as zero (R8)", async () => {
    const limits = { [food]: eur(30000), [groceries]: { amount: 5000, currency: "JPY" } }

    expect(await budgetAllowance(cafes, family(limits), readers([]).rate)).toEqual({
      amount: 30000,
      currency: "EUR",
      leftOut: ["JPY"],
    })
  })

  it("ignores an archived sibling's limit", async () => {
    const limits = { [food]: eur(30000), [groceries]: eur(20000) }

    expect(
      await budgetAllowance(cafes, family(limits, archiving(groceries)), readers([]).rate),
    ).toEqual({ amount: 30000, currency: "EUR", leftOut: [] })
  })

  it("leaves nothing, never less than nothing, when the siblings already use the parent's limit", async () => {
    const limits = { [food]: eur(10000), [groceries]: eur(20000) }

    expect(await budgetAllowance(cafes, family(limits), readers([]).rate)).toMatchObject({
      amount: 0,
    })
    expect(await refusal(cafes, eur(1), limits)).toMatchObject({ code: "BUDGET_OVER_PARENT" })
  })

  it("refuses a parent's own limit below its live children's limits, naming their sum", async () => {
    const limits = { [groceries]: eur(20000), [cafes]: usd(10000) }

    expect(await refusal(food, eur(29000), limits)).toBeNull()
    expect(await refusal(food, eur(28999), limits)).toEqual({
      code: "BUDGET_UNDER_CHILDREN",
      bound: { amount: 29000, currency: "EUR", leftOut: [] },
    })
    expect(await refusal(food, eur(1), limits, archiving(groceries))).toMatchObject({
      bound: { amount: 9000 },
    })
  })

  it("names a child's currency with no rate in the parent's floor, leaving it out", async () => {
    const limits = { [groceries]: eur(20000), [cafes]: { amount: 5000, currency: "JPY" } }

    expect(await refusal(food, eur(1), limits)).toEqual({
      code: "BUDGET_UNDER_CHILDREN",
      bound: { amount: 20000, currency: "EUR", leftOut: ["JPY"] },
    })
  })

  it("never refuses removing a limit, from a child or a parent", async () => {
    const limits = { [food]: eur(100), [groceries]: eur(20000), [cafes]: eur(9000) }

    expect(await refusal(cafes, null, limits)).toBeNull()
    expect(await refusal(food, null, limits)).toBeNull()
  })

  it("gives each child row of a month its allowance, and a parent or a free child none", async () => {
    const month = await budgetMonth(
      november({ [food]: eur(30000), [groceries]: eur(20000), [rent]: eur(1) }),
      readers([]),
    )
    const free = await budgetMonth(november({ [groceries]: eur(20000) }), readers([]))
    const allowanceOf = (read: BudgetMonth, id: string) =>
      read.rows.find((row) => row.categoryId === id)?.allowance

    expect(allowanceOf(month, cafes)).toEqual({ amount: 10000, currency: "EUR", leftOut: [] })
    expect(allowanceOf(month, groceries)).toEqual({ amount: 30000, currency: "EUR", leftOut: [] })
    expect(allowanceOf(month, food)).toBeUndefined()
    expect(allowanceOf(month, rent)).toBeUndefined()
    expect(allowanceOf(free, cafes)).toBeUndefined()
  })
})
