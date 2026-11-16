import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupRole } from "@domain/groups"
import type { CoinPrice } from "@domain/money"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  ACCOUNT_ALIAS_MAX,
  ACCOUNT_MAX_PER_GROUP,
  ACCOUNT_NAME_MAX_LENGTH,
  accountCreatePayloadSchema,
  AccountError,
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
const codeOf = (write: () => unknown) => {
  try {
    write()
  } catch (error) {
    if (error instanceof AccountError) return { code: error.code, fields: error.fields }
    throw error
  }
  throw new Error("expected a refusal")
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

  it("leaves aliases out of a create or an update that has none, so a queued older command keeps them", () => {
    expect("aliases" in parseAccountRequest(accountCreatePayloadSchema, base)).toBe(false)
    expect(
      "aliases" in parseAccountRequest(accountUpdatePayloadSchema, { ...base, version: 3 }),
    ).toBe(false)
  })

  it("trims each alias, drops blank ones and keeps the first of two that fold alike", () => {
    const parsed = parseAccountRequest(accountUpdatePayloadSchema, {
      ...base,
      version: 3,
      aliases: ["  Card ", "", "   ", "Наличка", "card", "НАЛИЧКА", "Épargne", "epargne"],
    })

    expect(parsed.aliases).toEqual(["Card", "Наличка", "Épargne"])
  })

  it("takes an alias up to the longest name in characters and refuses a longer one", () => {
    const alias = "💳".repeat(ACCOUNT_NAME_MAX_LENGTH)

    expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, aliases: [alias] }).aliases)
      .toEqual([alias])
    expect(
      codeOf(() =>
        parseAccountRequest(accountCreatePayloadSchema, { ...base, aliases: [alias + "💳"] })
      ),
    ).toEqual({
      code: "INVALID_REQUEST",
      fields: { aliases: { code: "maxLength", values: { rule: ACCOUNT_NAME_MAX_LENGTH } } },
    })
  })

  it("refuses an alias with a control or an invisible character", () => {
    for (const alias of ["a\u0000b", "a\nb", "a\u200bb", "a\u202eb"]) {
      expect(
        codeOf(() =>
          parseAccountRequest(accountCreatePayloadSchema, { ...base, aliases: ["ok", alias] })
        ),
      ).toEqual({ code: "INVALID_REQUEST", fields: { aliases: { code: "unsafeCharacters" } } })
    }
  })

  it("takes the most aliases and refuses one more by the count alone", () => {
    const most = Array.from({ length: ACCOUNT_ALIAS_MAX }, (_, i) => `alias ${i}`)

    expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, aliases: most }).aliases)
      .toEqual(most)
    // Not one of the 10 000 items is a string: the count refuses the list before any is read.
    const huge = Array.from({ length: 10_000 }, () => 1)
    for (const aliases of [[...most, "x".repeat(64)], huge]) {
      expect(codeOf(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, aliases })))
        .toEqual({
          code: "INVALID_REQUEST",
          fields: { aliases: { code: "maxItems", values: { rule: ACCOUNT_ALIAS_MAX } } },
        })
    }
  })

  it("takes only a list of text as aliases", () => {
    for (const aliases of ["Card", [1], [null], null]) {
      expect(
        codeOf(() => parseAccountRequest(accountCreatePayloadSchema, { ...base, aliases })).code,
      ).toBe("INVALID_REQUEST")
    }
  })

  it("names an account, not a category, in an alias refusal's message", () => {
    expect(() =>
      parseAccountRequest(accountCreatePayloadSchema, { ...base, aliases: ["a\u0000b"] })
    ).toThrow("Account aliases must not contain control or invisible characters")
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

  it("reads an older entry without aliases, and cleans and counts the aliases of a newer one", () => {
    expect(parseAccountExportEntry(entry).aliases).toBeUndefined()
    expect(parseAccountExportEntry({ ...entry, aliases: [" Card", "card", ""] }).aliases)
      .toEqual(["Card"])
    expect(() => parseAccountExportEntry({ ...entry, aliases: [1] })).toThrow("alias")
    expect(() =>
      parseAccountExportEntry({
        ...entry,
        aliases: Array.from({ length: ACCOUNT_ALIAS_MAX + 1 }, () => 1),
      })
    ).toThrow(`at most ${ACCOUNT_ALIAS_MAX} aliases`)
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
      coinPriceDate: null,
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
      coinPriceDate: null,
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
      coinPriceDate: null,
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

describe("the household total with coins at today's price", () => {
  const eur = (quote: string, rate: string, date: string): ExchangeRate => ({
    base: "EUR",
    quote,
    rate,
    date,
    source: "frankfurter:ECB",
  })
  const price = (coin: string, euros: string, date: string): CoinPrice => ({
    coin,
    price: euros,
    date,
  })
  // 0.5 BTC is stored as 50,000,000 satoshi: the coin's own 8 decimals.
  const halfBitcoin = { currency: "BTC", balance: 50_000_000 }
  const btc = new Map([["BTC", price("BTC", "60000.5", "2026-11-06")]])

  it("values 0.5 BTC by its 8 decimals at the stored euro price and names the price date", () => {
    const total = householdTotal([halfBitcoin], "EUR", new Map(), btc)

    // 0.5 × €60,000.50 = €30,000.25.
    expect(total).toEqual({
      amount: 3_000_025,
      currency: "EUR",
      rateDate: null,
      coinPriceDate: "2026-11-06",
      leftOut: [],
      tooLarge: false,
    })
  })

  it("crosses the euro price with the euro's rate for another base, and names both dates", () => {
    const total = householdTotal(
      [halfBitcoin],
      "USD",
      new Map([["EUR", eur("USD", "1.25", "2026-11-05")]]),
      btc,
    )

    // €30,000.25 × 1.25 = $37,500.3125, so 3,750,031 cents.
    expect(total.amount).toBe(3_750_031)
    expect(total.rateDate).toBe("2026-11-05")
    expect(total.coinPriceDate).toBe("2026-11-06")
    expect(total.leftOut).toEqual([])
  })

  it("leaves out and names a coin with no stored price, never counting it as 0", () => {
    const total = householdTotal(
      [halfBitcoin, halfBitcoin, { currency: "EUR", balance: 1_000 }],
      "EUR",
      new Map(),
      new Map([["BTC", null]]),
    )

    expect(total.amount).toBe(1_000)
    expect(total.coinPriceDate).toBeNull()
    expect(total.leftOut).toEqual([{ currency: "BTC", accounts: 2 }])
  })

  it("leaves out a priced coin when the base currency has no rate to the euro", () => {
    const total = householdTotal([halfBitcoin], "USD", new Map([["EUR", null]]), btc)

    expect(total.amount).toBeNull()
    expect(total.rateDate).toBeNull()
    expect(total.coinPriceDate).toBeNull()
    expect(total.leftOut).toEqual([{ currency: "BTC", accounts: 1 }])
  })

  it("names the oldest coin price date and the oldest rate date apart, with coins and fiat mixed", () => {
    const total = householdTotal(
      [
        // 2 ETH at €2,000 = €4,000.
        { currency: "ETH", balance: 200_000_000 },
        halfBitcoin,
        // ¥16,000 / 160 = €100.
        { currency: "JPY", balance: 16_000 },
      ],
      "EUR",
      new Map([["JPY", eur("JPY", "160", "2026-11-05")]]),
      new Map([...btc, ["ETH", price("ETH", "2000", "2026-11-04")]]),
    )

    expect(total).toEqual({
      amount: 3_000_025 + 400_000 + 10_000,
      currency: "EUR",
      rateDate: "2026-11-05",
      coinPriceDate: "2026-11-04",
      leftOut: [],
      tooLarge: false,
    })
  })
})
