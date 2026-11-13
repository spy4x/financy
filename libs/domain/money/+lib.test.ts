import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { type } from "arktype"
import { GroupRole } from "@domain/groups"
import { currencyOptions } from "@spy4x/platform/universal/money-core"
import {
  accountCurrencyCode,
  amountDecimals,
  assertCanChangeHouseholdSettings,
  assertCanReadHouseholdSettings,
  COINS,
  HouseholdError,
  householdUpdateSettingsPayloadSchema,
  parseHouseholdRequest,
  readHouseholdSettingsView,
} from "./+lib.ts"

describe("the coin list", () => {
  it("passes ts-libs' custom currency rules, so no coin code is an ISO 4217 code", () => {
    const codes = currencyOptions("en", COINS).map((option) => option.code)
    expect(codes).toEqual(expect.arrayContaining(["BTC", "ETH"]))
    expect(() => currencyOptions("en", [...COINS, { code: "USD", name: "Fake", decimals: 2 }]))
      .toThrow(RangeError)
  })

  it("gives BTC and ETH 8 decimals and every ISO currency its table's", () => {
    expect([amountDecimals("BTC"), amountDecimals("ETH")]).toEqual([8, 8])
    expect([amountDecimals("JPY"), amountDecimals("USD"), amountDecimals("BHD")]).toEqual([0, 2, 3])
  })

  it("accepts an ISO code or a listed coin as an account's currency, and nothing else", () => {
    for (const code of ["USD", "BTC", "ETH"]) expect(accountCurrencyCode(code)).toBe(code)
    for (const code of ["DOGE", "btc", "XYZ"]) {
      expect(accountCurrencyCode(code)).toBeInstanceOf(type.errors)
    }
  })
})

const groupId = "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111002"

function codeOf(run: () => unknown): string | null {
  try {
    run()
    return null
  } catch (error) {
    if (error instanceof HouseholdError) return error.code
    throw error
  }
}

describe("parsing a main currency change", () => {
  it("takes an ISO 4217 code and the version it replaces", () => {
    expect(
      parseHouseholdRequest(householdUpdateSettingsPayloadSchema, {
        groupId,
        baseCurrency: "JPY",
        version: 0,
      }),
    ).toEqual({ groupId, baseCurrency: "JPY", version: 0 })
  })

  it("refuses a code that is not in the ISO 4217 table, lower case included", () => {
    for (const baseCurrency of ["XYZ", "jpy", "BTC", ""]) {
      expect(codeOf(() =>
        parseHouseholdRequest(householdUpdateSettingsPayloadSchema, {
          groupId,
          baseCurrency,
          version: 0,
        })
      )).toBe("INVALID_REQUEST")
    }
  })

  it("refuses a negative version and an extra field", () => {
    expect(codeOf(() =>
      parseHouseholdRequest(householdUpdateSettingsPayloadSchema, {
        groupId,
        baseCurrency: "JPY",
        version: -1,
      })
    )).toBe("INVALID_REQUEST")
    expect(codeOf(() =>
      parseHouseholdRequest(householdUpdateSettingsPayloadSchema, {
        groupId,
        baseCurrency: "JPY",
        version: 0,
        updatedBy: 1,
      })
    )).toBe("INVALID_REQUEST")
  })
})

describe("who may change the main currency", () => {
  it("lets an admin and the owner, refuses an editor and a viewer, hides the group from a stranger", () => {
    expect(codeOf(() => assertCanChangeHouseholdSettings(GroupRole.OWNER))).toBeNull()
    expect(codeOf(() => assertCanChangeHouseholdSettings(GroupRole.ADMIN))).toBeNull()
    expect(codeOf(() => assertCanChangeHouseholdSettings(GroupRole.EDITOR))).toBe(
      "ROLE_INSUFFICIENT",
    )
    expect(codeOf(() => assertCanChangeHouseholdSettings(GroupRole.VIEWER))).toBe(
      "ROLE_INSUFFICIENT",
    )
    expect(codeOf(() => assertCanChangeHouseholdSettings(null))).toBe("GROUP_NOT_FOUND")
  })

  it("lets every member read it, and hides the group from a stranger", () => {
    expect(codeOf(() => assertCanReadHouseholdSettings(GroupRole.VIEWER))).toBeNull()
    expect(codeOf(() => assertCanReadHouseholdSettings(null))).toBe("GROUP_NOT_FOUND")
  })
})

describe("reading the settings view the API sent", () => {
  const view = {
    settings: { groupId, baseCurrency: "EUR", version: 0, chosen: false, updatedAt: null },
    rates: [{
      base: "EUR",
      quote: "USD",
      rate: "1.1172",
      date: "2026-10-30",
      source: "frankfurter:ECB",
    }],
    ratedCurrencies: ["EUR", "USD"],
    coinPrices: [{ coin: "BTC", price: "69608.44966893936", date: "2026-10-30" }],
  }

  it("keeps a well-formed view and turns the save time into a date", () => {
    const saved = { ...view, settings: { ...view.settings, updatedAt: "2026-10-31T10:00:00.000Z" } }
    expect(readHouseholdSettingsView(saved)?.settings.updatedAt).toEqual(
      new Date("2026-10-31T10:00:00.000Z"),
    )
  })

  it("refuses a rate that is not a plain decimal", () => {
    expect(readHouseholdSettingsView({ ...view, rates: [{ ...view.rates[0], rate: "-1" }] }))
      .toBeNull()
  })

  it("keeps the coin prices, and refuses a price that is not a plain decimal", () => {
    expect(readHouseholdSettingsView(view)?.coinPrices).toEqual(view.coinPrices)
    for (const price of ["-1", "1e5", "", "NaN"]) {
      expect(readHouseholdSettingsView({ ...view, coinPrices: [{ ...view.coinPrices[0], price }] }))
        .toBeNull()
    }
    expect(readHouseholdSettingsView({ ...view, coinPrices: undefined })).toBeNull()
  })
})
