import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupRole } from "@domain/groups"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  ACCOUNT_MAX_PER_GROUP,
  ACCOUNT_NAME_MAX_LENGTH,
  accountCreatePayloadSchema,
  accountExportProblems,
  AccountKind,
  accountUpdatePayloadSchema,
  assertAccountRoom,
  assertCanReadAccounts,
  assertCanWriteAccounts,
  assertKindFitsCurrency,
  householdTotal,
  parseAccountExportEntry,
  parseAccountRequest,
} from "./+lib.ts"

const groupId = "019a5b0e-1af5-7f04-8ae4-b1ee5d111002"
const id = "019a5b0e-1af5-7f04-8ae4-b1ee5d112001"
const base = {
  groupId,
  id,
  name: "Main account",
  kind: AccountKind.BANK,
  currency: "USD",
  startingBalance: 1234,
}

describe("parsing an account request", () => {
  it("trims the name and keeps the currency code and the smallest-unit amount", () => {
    const parsed = parseAccountRequest(accountCreatePayloadSchema, { ...base, name: "  Wallet  " })

    expect(parsed).toEqual({ ...base, name: "Wallet" })
  })

  it("counts an emoji as one character, up to the longest name", () => {
    const name = "💶".repeat(ACCOUNT_NAME_MAX_LENGTH)

    expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, name }).name).toBe(name)
    expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, name: name + "💶" }))
      .toThrow("Account name must contain")
    expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, name: "  " }))
      .toThrow("Account name must contain")
  })

  it("refuses a name with a control or an invisible character", () => {
    for (const name of ["a\u0000b", "a\nb", "a​b", "a‮b"]) {
      expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, name }))
        .toThrow("control or invisible")
    }
  })

  it("takes a currency by its ISO code only: lower case, an unknown code and an id are refused", () => {
    for (const currency of ["usd", "XYZ", "1", 1, "019a5b0e-1af5-7f04-8ae4-b1ee5d112001"]) {
      expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, currency }))
        .toThrow("currency")
    }
    for (const currency of ["JPY", "BHD", "VND", "EUR"]) {
      expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, currency }).currency)
        .toBe(currency)
    }
  })

  it("takes a listed coin as the currency, and refuses a coin that is not listed", () => {
    for (const currency of ["BTC", "ETH"]) {
      expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, currency }).currency)
        .toBe(currency)
    }
    for (const currency of ["DOGE", "btc"]) {
      expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, currency }))
        .toThrow("currency")
    }
  })

  it("refuses a fraction of the smallest unit as the starting balance (R2)", () => {
    expect(() =>
      parseAccountRequest(accountCreatePayloadSchema, { ...base, startingBalance: 12.5 })
    )
      .toThrow("startingBalance")
    expect(() =>
      parseAccountRequest(accountCreatePayloadSchema, { ...base, startingBalance: "1234" })
    ).toThrow("startingBalance")
  })

  it("takes a starting balance up to the safe-integer bound either way and refuses one past it (R3)", () => {
    for (const startingBalance of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 0]) {
      expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, startingBalance }))
        .toEqual({ ...base, startingBalance })
    }
    for (const startingBalance of [Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1]) {
      expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, startingBalance }))
        .toThrow("startingBalance")
    }
  })

  it("takes the seven kinds and refuses any other number", () => {
    for (const kind of [1, 2, 3, 4, 5, 6, 7]) {
      expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, kind }).kind).toBe(kind)
    }
    for (const kind of [0, 8, 1.5, "bank"]) {
      expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, kind })).toThrow(
        "kind",
      )
    }
  })

  it("asks an update for the version it edited", () => {
    expect(parseAccountRequest(accountUpdatePayloadSchema, { ...base, version: 3 }).version).toBe(3)
    expect(() => parseAccountRequest(accountUpdatePayloadSchema, base)).toThrow("version")
  })

  it("refuses a field the payload does not have, such as a balance", () => {
    expect(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, balance: 1 }))
      .toThrow()
  })
})

describe("which currency fits which kind", () => {
  it("lets a crypto account hold a listed coin, and every other kind an ISO currency", () => {
    expect(() => assertKindFitsCurrency(AccountKind.CRYPTO, "BTC")).not.toThrow()
    expect(() => assertKindFitsCurrency(AccountKind.CRYPTO, "ETH")).not.toThrow()
    expect(() => assertKindFitsCurrency(AccountKind.BANK, "USD")).not.toThrow()
  })

  it("refuses a crypto account in a fiat currency, and a coin on any other kind", () => {
    expect(() => assertKindFitsCurrency(AccountKind.CRYPTO, "USD"))
      .toThrow("A crypto account must hold a listed coin, not USD")
    for (const kind of [AccountKind.CASH, AccountKind.BANK, AccountKind.LIABILITY]) {
      expect(() => assertKindFitsCurrency(kind, "BTC"))
        .toThrow("Only a crypto account can hold BTC")
    }
  })
})

describe("the household's account cap", () => {
  it("lets a household reach the cap and refuses the account past it", () => {
    expect(() => assertAccountRoom(ACCOUNT_MAX_PER_GROUP)).not.toThrow()
    expect(() => assertAccountRoom(ACCOUNT_MAX_PER_GROUP + 1)).toThrow(
      `A household can hold at most ${ACCOUNT_MAX_PER_GROUP} accounts`,
    )
  })
})

describe("who may use accounts (R16)", () => {
  it("lets every member read, an editor write, and hides the household from a stranger", () => {
    expect(() => assertCanReadAccounts(GroupRole.VIEWER)).not.toThrow()
    expect(() => assertCanWriteAccounts(GroupRole.EDITOR)).not.toThrow()
    expect(() => assertCanWriteAccounts(GroupRole.OWNER)).not.toThrow()
    expect(() => assertCanWriteAccounts(GroupRole.VIEWER)).toThrow("Only an editor")
    expect(() => assertCanReadAccounts(null)).toThrow("Group not found")
    expect(() => assertCanWriteAccounts(null)).toThrow("Group not found")
  })
})

describe("an account in an export file", () => {
  const entry = {
    id,
    name: "Wallet",
    kind: AccountKind.CASH,
    currency: "VND",
    startingBalance: 1_200_000,
    archived: false,
    isDefault: true,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  }

  it("reads an entry with the rules of a create, and refuses an unknown field", () => {
    expect(parseAccountExportEntry(entry).currency).toBe("VND")
    expect(() => parseAccountExportEntry({ ...entry, balance: 5 })).toThrow("does not have")
    expect(() => parseAccountExportEntry({ ...entry, currency: "vnd" })).toThrow()
  })

  it("reads a crypto account in BTC, and refuses a coin on a cash account or a crypto one in VND", () => {
    const crypto = { ...entry, kind: AccountKind.CRYPTO, currency: "BTC" }
    expect(parseAccountExportEntry(crypto).currency).toBe("BTC")
    expect(() => parseAccountExportEntry({ ...entry, currency: "BTC" }))
      .toThrow("Only a crypto account can hold BTC")
    expect(() => parseAccountExportEntry({ ...crypto, currency: "VND" }))
      .toThrow("A crypto account must hold a listed coin, not VND")
  })

  it("refuses a second default, an archived default and more accounts than the cap", () => {
    const two = [{ isDefault: true, archived: false }, { isDefault: true, archived: false }]
    expect(accountExportProblems(two).map((problem) => problem.issue.code))
      .toEqual(["secondDefaultAccount"])
    expect(accountExportProblems([{ isDefault: true, archived: true }])[0].issue.code)
      .toBe("archivedDefaultAccount")
    const many = Array.from(
      { length: ACCOUNT_MAX_PER_GROUP + 1 },
      () => ({ isDefault: false, archived: false }),
    )
    expect(accountExportProblems(many)[0].issue.code).toBe("tooManyAccounts")
    expect(accountExportProblems(many.slice(1))).toEqual([])
  })
})

describe("the household total in its base currency", () => {
  /** An ECB rate: one euro buys `rate` of `quote` on `date`. */
  const eur = (quote: string, rate: string, date = "2026-11-06"): ExchangeRate => ({
    base: "EUR",
    quote,
    rate,
    date,
    source: "frankfurter:ECB",
  })
  const rates = new Map([
    ["JPY", eur("JPY", "160")],
    ["USD", eur("USD", "1.08", "2026-11-05")],
    ["BHD", eur("BHD", "0.4")],
  ])

  it("converts yen, dollars and dinars into euros by their own decimals and names the oldest rate date", () => {
    const total = householdTotal(
      [
        // ¥10,000 / 160 = €62.50 exactly.
        { currency: "JPY", balance: 10_000 },
        // $123.45 / 1.08 = €114.30555…, so 11,431 cents.
        { currency: "USD", balance: 12_345 },
        // 1.234 BHD / 0.4 = €3.085, half a cent, so 309 cents.
        { currency: "BHD", balance: 1_234 },
      ],
      "EUR",
      rates,
    )

    expect(total).toEqual({
      amount: 6_250 + 11_431 + 309,
      currency: "EUR",
      rateDate: "2026-11-05",
      leftOut: [],
      tooLarge: false,
    })
  })

  it("rounds each account to the cent before adding, half away from zero", () => {
    const halfCent = new Map([["USD", eur("USD", "2")]])

    // Each 1-cent account is half a euro cent: each rounds up to 1, so 2, where rounding the sum
    // of the exact amounts would give 1.
    expect(
      householdTotal(
        [{ currency: "USD", balance: 1 }, { currency: "USD", balance: 1 }],
        "EUR",
        halfCent,
      ).amount,
    ).toBe(2)
    // A liability's minus half a cent rounds away from zero too.
    expect(householdTotal([{ currency: "USD", balance: -1 }], "EUR", halfCent).amount).toBe(-1)
  })

  it("lowers the total by a liability's negative balance", () => {
    const total = householdTotal(
      [
        { currency: "EUR", balance: 100_000 },
        { currency: "JPY", balance: -3_200_000 },
      ],
      "EUR",
      rates,
    )

    expect(total.amount).toBe(100_000 - 2_000_000)
  })

  it("leaves out a currency with no rate and counts its accounts, never at 0 or 1", () => {
    const total = householdTotal(
      [
        { currency: "EUR", balance: 5_000 },
        { currency: "GEL", balance: 1_000 },
        { currency: "GEL", balance: 2_000 },
        { currency: "AMD", balance: 9_000 },
      ],
      "EUR",
      new Map([["AMD", null]]),
    )

    expect(total).toEqual({
      amount: 5_000,
      currency: "EUR",
      rateDate: null,
      leftOut: [{ currency: "AMD", accounts: 1 }, { currency: "GEL", accounts: 2 }],
      tooLarge: false,
    })
  })

  it("gives no number when no account could be converted", () => {
    const total = householdTotal([{ currency: "GEL", balance: 1_000 }], "EUR", new Map())

    expect(total.amount).toBeNull()
    expect(total.tooLarge).toBe(false)
    expect(total.leftOut).toEqual([{ currency: "GEL", accounts: 1 }])
  })

  it("is exact with no rate date when every account is in the base currency", () => {
    const total = householdTotal(
      [
        { currency: "EUR", balance: 12_345 },
        { currency: "EUR", balance: -45 },
      ],
      "EUR",
      rates,
    )

    expect(total).toEqual({
      amount: 12_300,
      currency: "EUR",
      rateDate: null,
      leftOut: [],
      tooLarge: false,
    })
  })

  it("gives no number for a sum past the safe integer bound, instead of a rounded one", () => {
    const total = householdTotal(
      [
        { currency: "EUR", balance: Number.MAX_SAFE_INTEGER },
        { currency: "EUR", balance: 1 },
      ],
      "EUR",
      rates,
    )

    expect(total.amount).toBeNull()
    expect(total.tooLarge).toBe(true)
  })

  it("gives no number when one account's conversion is past the safe bound", () => {
    // The largest dollar amount at a rate that makes it 100 times larger in euros.
    const total = householdTotal(
      [{ currency: "USD", balance: Number.MAX_SAFE_INTEGER }, { currency: "EUR", balance: 1 }],
      "EUR",
      new Map([["USD", eur("USD", "0.01")]]),
    )

    expect(total.amount).toBeNull()
    expect(total.tooLarge).toBe(true)
  })
})
