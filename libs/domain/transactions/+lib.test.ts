import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  assertCanReadTransactions,
  assertCanWriteTransactions,
  assertEntryReferences,
  deriveAmounts,
  type EntryRateLookup,
  LEDGER_MAX_DAYS,
  type LedgerCategory,
  parseTransactionRequest,
  summarizeLedger,
  TRANSACTION_MEMO_MAX_LENGTH,
  transactionCreatePayloadSchema,
  type TransactionFields,
  TransactionKind,
  transactionLedgerPayloadSchema,
  transactionUpdatePayloadSchema,
} from "./+lib.ts"

const groupId = "019a5b0e-1af5-7f04-8ae4-b1ee5d111002"
const id = "019a5b0e-1af5-7f04-8ae4-b1ee5d113001"
const accountId = "019a5b0e-1af5-7f04-8ae4-b1ee5d112001"
const categoryId = "019a5b0e-1af5-7f04-8ae4-b1ee5d114001"
const base = {
  groupId,
  id,
  accountId,
  categoryId,
  kind: TransactionKind.EXPENSE,
  amount: 1234,
  currency: "USD",
}

function rate(base: string, quote: string, value: string, date = "2026-11-01"): ExchangeRate {
  return { base, quote, rate: value, date, source: "test" }
}

/** A lookup that answers from `table`, keyed `BASE:QUOTE:DATE`, and records every call. */
function lookupFrom(table: Record<string, string>): EntryRateLookup & { calls: string[] } {
  const calls: string[] = []
  const lookup = (base: string, quote: string, date: string) => {
    calls.push(`${base}:${quote}:${date}`)
    const value = table[`${base}:${quote}:${date}`]
    return Promise.resolve(value === undefined ? null : rate(base, quote, value, date))
  }
  return Object.assign(lookup, { calls })
}

/** The code of the error `run` throws, or `undefined` when it does not throw. */
function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    return (error as { code?: string }).code
  }
}

/** The code `promise` rejects with, or `undefined` when it resolves. */
async function asyncCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return (error as { code?: string }).code
  }
}

const fields = (overrides: Partial<TransactionFields> = {}): TransactionFields => ({
  accountId,
  categoryId,
  kind: TransactionKind.EXPENSE,
  amount: 1000,
  currency: "USD",
  memo: "",
  date: "2026-11-05",
  ...overrides,
})

describe("parsing a transaction request", () => {
  it("keeps a positive whole amount in the smallest unit and trims the memo", () => {
    const parsed = parseTransactionRequest(transactionCreatePayloadSchema, {
      ...base,
      memo: "  Lunch  ",
      date: "2026-11-05",
    })

    expect(parsed).toEqual({ ...base, memo: "Lunch", date: "2026-11-05" })
  })

  it("refuses an amount that is not a whole number above zero (R1, R5)", () => {
    for (const amount of [12.34, 0, -5, "1234", Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseTransactionRequest(transactionCreatePayloadSchema, { ...base, amount }))
        .toThrow("amount")
    }
    for (const accountAmount of [0.5, 0, -1]) {
      expect(() =>
        parseTransactionRequest(transactionCreatePayloadSchema, { ...base, accountAmount })
      ).toThrow("accountAmount")
    }
  })

  it("accepts the largest exact amount and no larger (R3)", () => {
    const amount = Number.MAX_SAFE_INTEGER

    expect(parseTransactionRequest(transactionCreatePayloadSchema, { ...base, amount }).amount)
      .toBe(amount)
  })

  it("refuses fields the server sets: the sign, the conversion flag, the author (R18)", () => {
    for (
      const extra of [{ converted: true }, { createdByUserId: 1 }, { sign: -1 }, { version: 3 }]
    ) {
      expect(() => parseTransactionRequest(transactionCreatePayloadSchema, { ...base, ...extra }))
        .toThrow("must be removed")
    }
  })

  it("refuses a kind other than expense or income", () => {
    for (const kind of [0, 3, "1"]) {
      expect(() => parseTransactionRequest(transactionCreatePayloadSchema, { ...base, kind }))
        .toThrow("kind")
    }
  })

  it("takes a calendar date only: no time, no impossible day (R14)", () => {
    for (const date of ["2026-02-30", "2026-11-05T10:00:00Z", "05.11.2026", "2026-13-01"]) {
      expect(() => parseTransactionRequest(transactionCreatePayloadSchema, { ...base, date }))
        .toThrow("date")
    }
  })

  it("counts a memo in characters, keeps a line break and refuses invisible characters", () => {
    const memo = "💶".repeat(TRANSACTION_MEMO_MAX_LENGTH)

    expect(parseTransactionRequest(transactionCreatePayloadSchema, { ...base, memo }).memo).toBe(
      memo,
    )
    expect(parseTransactionRequest(transactionCreatePayloadSchema, { ...base, memo: "a\nb" }).memo)
      .toBe("a\nb")
    expect(() =>
      parseTransactionRequest(transactionCreatePayloadSchema, { ...base, memo: memo + "💶" })
    ).toThrow("at most")
    for (const bad of ["a\u0000b", "a​b", "a‮b"]) {
      expect(() => parseTransactionRequest(transactionCreatePayloadSchema, { ...base, memo: bad }))
        .toThrow("control or invisible")
    }
  })

  it("needs the version on an update", () => {
    expect(() => parseTransactionRequest(transactionUpdatePayloadSchema, base)).toThrow("version")
  })

  it("needs the memo and the date on an update, so an edit never falls back to today or no memo", () => {
    const edit = { ...base, memo: "Lunch", date: "2026-11-05", version: 1 }
    const { memo: _memo, ...noMemo } = edit
    const { date: _date, ...noDate } = edit

    expect(parseTransactionRequest(transactionUpdatePayloadSchema, edit).date).toBe("2026-11-05")
    expect(() => parseTransactionRequest(transactionUpdatePayloadSchema, noMemo)).toThrow("memo")
    expect(() => parseTransactionRequest(transactionUpdatePayloadSchema, noDate)).toThrow("date")
  })

  it("takes a listed coin as the currency paid, and refuses a coin that is not listed", () => {
    for (const currency of ["BTC", "ETH"]) {
      expect(
        parseTransactionRequest(transactionCreatePayloadSchema, { ...base, currency }).currency,
      )
        .toBe(currency)
    }
    for (const currency of ["DOGE", "btc"]) {
      expect(() => parseTransactionRequest(transactionCreatePayloadSchema, { ...base, currency }))
        .toThrow("currency")
    }
  })

  it("takes a ledger period that runs forward and spans at most a leap year", () => {
    const period = (from: string, to: string) =>
      parseTransactionRequest(transactionLedgerPayloadSchema, { groupId, from, to })

    expect(period("2024-01-01", "2024-12-31")).toEqual({
      groupId,
      from: "2024-01-01",
      to: "2024-12-31",
    })
    expect(period("2026-11-05", "2026-11-05").from).toBe("2026-11-05")
    expect(() => period("2026-11-05", "2026-11-04")).toThrow("runs forward")
    expect(() => period("2024-01-01", "2025-01-01")).toThrow(`${LEDGER_MAX_DAYS} days`)
  })
})

describe("who may read and write entries (R16)", () => {
  it("lets every member read and answers a stranger that the group does not exist", () => {
    for (const role of [GroupRole.VIEWER, GroupRole.EDITOR, GroupRole.ADMIN, GroupRole.OWNER]) {
      expect(() => assertCanReadTransactions(role)).not.toThrow()
    }
    expect(() => assertCanReadTransactions(null)).toThrow("Group not found")
  })

  it("lets an editor and above write, and refuses a viewer", () => {
    for (const role of [GroupRole.EDITOR, GroupRole.ADMIN, GroupRole.OWNER]) {
      expect(() => assertCanWriteTransactions(role)).not.toThrow()
    }
    expect(codeOf(() => assertCanWriteTransactions(GroupRole.VIEWER))).toBe("ROLE_INSUFFICIENT")
    expect(codeOf(() => assertCanWriteTransactions(null))).toBe("GROUP_NOT_FOUND")
  })
})

describe("what an entry points at (R12, R17)", () => {
  const account = { currency: "USD" }
  const expenseCategory = { kind: CategoryKind.EXPENSE }
  const incomeCategory = { kind: CategoryKind.INCOME }

  it("answers an account or a category outside the household as not found", () => {
    expect(
      codeOf(() =>
        assertEntryReferences(TransactionKind.EXPENSE, { account: null, category: expenseCategory })
      ),
    ).toBe("ACCOUNT_NOT_FOUND")
    expect(
      codeOf(() => assertEntryReferences(TransactionKind.EXPENSE, { account, category: null })),
    )
      .toBe("CATEGORY_NOT_FOUND")
  })

  it("refuses an expense in an income category", () => {
    expect(
      codeOf(() =>
        assertEntryReferences(TransactionKind.EXPENSE, { account, category: incomeCategory })
      ),
    ).toBe("CATEGORY_KIND_MISMATCH")
  })

  it("takes an income in an income category, and in an expense category as a refund", () => {
    for (const category of [incomeCategory, expenseCategory]) {
      expect(() => assertEntryReferences(TransactionKind.INCOME, { account, category })).not
        .toThrow()
    }
    expect(() =>
      assertEntryReferences(TransactionKind.EXPENSE, { account, category: expenseCategory })
    ).not.toThrow()
  })
})

describe("the amounts the server stores (R4, R5, R6)", () => {
  const noRates = lookupFrom({})

  it("makes an expense negative and an income positive, whatever the request held (R5)", async () => {
    expect(await deriveAmounts(fields(), "USD", null, noRates)).toEqual({
      accountAmount: -1000,
      amount: -1000,
      converted: false,
    })
    expect(
      await deriveAmounts(fields({ kind: TransactionKind.INCOME }), "USD", null, noRates),
    ).toEqual({ accountAmount: 1000, amount: 1000, converted: false })
  })

  it("refuses a different account amount in the account's own currency", async () => {
    expect(await asyncCodeOf(deriveAmounts(fields({ accountAmount: 999 }), "USD", null, noRates)))
      .toBe("INVALID_REQUEST")
    expect(await deriveAmounts(fields({ accountAmount: 1000 }), "USD", null, noRates))
      .toEqual({ accountAmount: -1000, amount: -1000, converted: false })
  })

  it("keeps both amounts as stated for a manual rate and asks no rate (R4)", async () => {
    const lookup = lookupFrom({})

    expect(
      await deriveAmounts(
        fields({ currency: "JPY", amount: 5000, accountAmount: 3321 }),
        "USD",
        null,
        lookup,
      ),
    ).toEqual({ accountAmount: -3321, amount: -5000, converted: false })
    expect(lookup.calls).toEqual([])
  })

  it("converts a missing account amount at the rate of the entry's date and marks it (R6)", async () => {
    // 5000 JPY at 0.0066423 USD each is 33.2115 USD, 3321 cents rounded.
    const lookup = lookupFrom({ "JPY:USD:2026-11-05": "0.0066423" })

    expect(
      await deriveAmounts(fields({ currency: "JPY", amount: 5000 }), "USD", null, lookup),
    ).toEqual({ accountAmount: -3321, amount: -5000, converted: true })
    expect(lookup.calls).toEqual(["JPY:USD:2026-11-05"])
  })

  it("answers NO_RATE when no rate reaches the entry's date, never a rate of 1 (R8)", async () => {
    expect(await asyncCodeOf(deriveAmounts(fields({ currency: "JPY" }), "USD", null, noRates)))
      .toBe("NO_RATE")
  })

  it("scales a coin by its own 8 decimals when it converts, both ways", async () => {
    // 0.5 BTC (50000000 units) at 60000 USD is 30000.00 USD; 12.34 USD at 0.00002 BTC is
    // 0.0002468 BTC, 24680 units. With 2 decimals for BTC both would be a million times off.
    const lookup = lookupFrom({ "BTC:USD:2026-11-05": "60000", "USD:BTC:2026-11-05": "0.00002" })

    expect(
      await deriveAmounts(fields({ currency: "BTC", amount: 50_000_000 }), "USD", null, lookup),
    ).toEqual({ accountAmount: -3_000_000, amount: -50_000_000, converted: true })
    expect(await deriveAmounts(fields({ amount: 1234 }), "BTC", null, lookup)).toEqual({
      accountAmount: -24_680,
      amount: -1234,
      converted: true,
    })
  })

  it("answers NO_RATE for a coin with no price, and takes it at a manual rate", async () => {
    expect(await asyncCodeOf(deriveAmounts(fields({ currency: "BTC" }), "USD", null, noRates)))
      .toBe("NO_RATE")
    expect(
      await deriveAmounts(
        fields({ currency: "BTC", amount: 50_000_000, accountAmount: 3_000_000 }),
        "USD",
        null,
        noRates,
      ),
    ).toEqual({ accountAmount: -3_000_000, amount: -50_000_000, converted: false })
  })

  it("refuses a conversion that rounds to nothing or that no longer fits", async () => {
    await expect(
      deriveAmounts(
        fields({ currency: "JPY", amount: 1 }),
        "BHD",
        null,
        lookupFrom({ "JPY:BHD:2026-11-05": "0.0001" }),
      ),
    ).rejects.toThrow("rounds to zero")
    await expect(
      deriveAmounts(
        fields({ currency: "EUR", amount: Number.MAX_SAFE_INTEGER }),
        "USD",
        null,
        lookupFrom({ "EUR:USD:2026-11-05": "2" }),
      ),
    ).rejects.toThrow("too large")
  })

  it("keeps the stored account amount on an edit that leaves the money as it was (R4)", async () => {
    const previous = {
      accountId,
      amount: -5000,
      currency: "JPY",
      date: "2026-11-05",
      accountAmount: -3300,
      converted: false,
    }
    const lookup = lookupFrom({ "JPY:USD:2026-11-05": "0.0066423" })

    expect(
      await deriveAmounts(
        fields({ currency: "JPY", amount: 5000, memo: "new memo" }),
        "USD",
        previous,
        lookup,
      ),
    ).toEqual({ accountAmount: -3300, amount: -5000, converted: false })
    expect(lookup.calls).toEqual([])
  })

  it("converts again when the edit changes the date or the amount", async () => {
    const previous = {
      accountId,
      amount: -5000,
      currency: "JPY",
      date: "2026-11-05",
      accountAmount: -3300,
      converted: false,
    }
    const lookup = lookupFrom({
      "JPY:USD:2026-11-04": "0.0066",
      "JPY:USD:2026-11-05": "0.0066423",
    })

    expect(
      (await deriveAmounts(
        fields({ currency: "JPY", amount: 5000, date: "2026-11-04" }),
        "USD",
        previous,
        lookup,
      )).accountAmount,
    ).toBe(-3300)
    expect(
      await deriveAmounts(fields({ currency: "JPY", amount: 6000 }), "USD", previous, lookup),
    ).toEqual({ accountAmount: -3985, amount: -6000, converted: true })
    expect(lookup.calls).toEqual(["JPY:USD:2026-11-04", "JPY:USD:2026-11-05"])
  })
})

describe("the ledger summary", () => {
  const food = "019a5b0e-1af5-7f04-8ae4-b1ee5d114001"
  const groceries = "019a5b0e-1af5-7f04-8ae4-b1ee5d114002"
  const rent = "019a5b0e-1af5-7f04-8ae4-b1ee5d114003"
  const salary = "019a5b0e-1af5-7f04-8ae4-b1ee5d114004"
  const categories: LedgerCategory[] = [
    { id: food, kind: CategoryKind.EXPENSE, parentId: null },
    { id: groceries, kind: CategoryKind.EXPENSE, parentId: food },
    { id: rent, kind: CategoryKind.EXPENSE, parentId: null },
    { id: salary, kind: CategoryKind.INCOME, parentId: null },
  ]
  const period = { currency: "EUR", from: "2026-11-01", to: "2026-11-30" }

  it("adds income, spending per category with parents including children, and net (R13)", async () => {
    const ledger = await summarizeLedger(
      [
        { categoryId: salary, currency: "EUR", date: "2026-11-01", amount: 300000 },
        { categoryId: groceries, currency: "EUR", date: "2026-11-02", amount: -4000 },
        { categoryId: food, currency: "EUR", date: "2026-11-03", amount: -1000 },
        { categoryId: rent, currency: "EUR", date: "2026-11-03", amount: -100000 },
      ],
      categories,
      period,
      lookupFrom({}),
    )

    expect(ledger).toEqual({
      ...period,
      income: 300000,
      spending: 105000,
      net: 195000,
      categories: [
        { categoryId: rent, spending: 100000 },
        { categoryId: food, spending: 5000 },
        { categoryId: groceries, spending: 4000 },
      ],
      leftOut: [],
      tooLarge: false,
    })
  })

  it("lowers a category's spending by a refund and does not count it as income (R12)", async () => {
    const ledger = await summarizeLedger(
      [
        { categoryId: groceries, currency: "EUR", date: "2026-11-02", amount: -4000 },
        { categoryId: groceries, currency: "EUR", date: "2026-11-04", amount: 1500 },
      ],
      categories,
      period,
      lookupFrom({}),
    )

    expect(ledger.income).toBe(0)
    expect(ledger.spending).toBe(2500)
    expect(ledger.net).toBe(-2500)
    expect(ledger.categories).toEqual([
      { categoryId: food, spending: 2500 },
      { categoryId: groceries, spending: 2500 },
    ])
  })

  it("converts each row at its own date's rate, never adding yen to dollars (legacy §4.2)", async () => {
    // 100.00 USD on the 2nd at 0.9 is 90.00 EUR; 10000 JPY on the 3rd at 0.006 is 60.00 EUR.
    const lookup = lookupFrom({
      "USD:EUR:2026-11-02": "0.9",
      "JPY:EUR:2026-11-03": "0.006",
    })
    const ledger = await summarizeLedger(
      [
        { categoryId: rent, currency: "USD", date: "2026-11-02", amount: -10000 },
        { categoryId: rent, currency: "JPY", date: "2026-11-03", amount: -10000 },
      ],
      categories,
      period,
      lookup,
    )

    expect(ledger.spending).toBe(15000)
    expect(lookup.calls.sort()).toEqual(["JPY:EUR:2026-11-03", "USD:EUR:2026-11-02"])
  })

  it("names a currency with no rate and leaves it out, never as 0 (R8)", async () => {
    const ledger = await summarizeLedger(
      [
        { categoryId: rent, currency: "EUR", date: "2026-11-02", amount: -1000 },
        { categoryId: rent, currency: "THB", date: "2026-11-02", amount: -50000 },
      ],
      categories,
      period,
      lookupFrom({}),
    )

    expect(ledger.spending).toBe(1000)
    expect(ledger.leftOut).toEqual(["THB"])
  })

  it("converts a coin row by its 8 decimals, and names a coin with no price", async () => {
    // 0.5 BTC at 55000 EUR is 27500.00 EUR; the ETH row has no price and is left out.
    const ledger = await summarizeLedger(
      [
        { categoryId: rent, currency: "BTC", date: "2026-11-02", amount: -50_000_000 },
        { categoryId: rent, currency: "ETH", date: "2026-11-02", amount: -10_000_000 },
      ],
      categories,
      period,
      lookupFrom({ "BTC:EUR:2026-11-02": "55000" }),
    )

    expect(ledger.spending).toBe(2_750_000)
    expect(ledger.leftOut).toEqual(["ETH"])
  })

  it("reports a sum past the exact range as too large instead of a wrong number", async () => {
    const ledger = await summarizeLedger(
      [
        {
          categoryId: salary,
          currency: "EUR",
          date: "2026-11-01",
          amount: Number.MAX_SAFE_INTEGER,
        },
        {
          categoryId: salary,
          currency: "EUR",
          date: "2026-11-02",
          amount: Number.MAX_SAFE_INTEGER,
        },
      ],
      categories,
      period,
      lookupFrom({}),
    )

    expect(ledger).toMatchObject({ income: null, spending: null, net: null, tooLarge: true })
  })
})
