import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupRole } from "@domain/groups"
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

  it("takes the six kinds and refuses any other number", () => {
    for (const kind of [1, 2, 3, 4, 5, 6]) {
      expect(parseAccountRequest(accountCreatePayloadSchema, { ...base, kind }).kind).toBe(kind)
    }
    for (const kind of [0, 7, 1.5, "bank"]) {
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
