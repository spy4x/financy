import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupRole } from "@domain/groups"
import {
  assertCanChangeHouseholdSettings,
  assertCanReadHouseholdSettings,
  HouseholdError,
  householdUpdateSettingsPayloadSchema,
  parseHouseholdRequest,
  readHouseholdSettingsView,
} from "./+lib.ts"

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
})
