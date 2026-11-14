import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupRole } from "@domain/groups"
import type { EntryRateLookup } from "@domain/transactions"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  assertCanReadTransfers,
  assertCanWriteTransfers,
  assertTransferReferences,
  deriveTransferAmounts,
  parseTransferRequest,
  TRANSFER_MEMO_MAX_LENGTH,
  transferCreatePayloadSchema,
  type TransferFields,
  transferUpdatePayloadSchema,
} from "./+lib.ts"

const groupId = "019a5b0e-1af5-7f04-8ae4-b1ee5d111002"
const id = "019a5b0e-1af5-7f04-8ae4-b1ee5d113001"
const card = "019a5b0e-1af5-7f04-8ae4-b1ee5d112001"
const cash = "019a5b0e-1af5-7f04-8ae4-b1ee5d112002"
const yen = "019a5b0e-1af5-7f04-8ae4-b1ee5d112003"
const base = { groupId, id, fromAccountId: card, toAccountId: cash, sentAmount: 10000 }

function rate(base: string, quote: string, value: string, date: string): ExchangeRate {
  return { base, quote, rate: value, date, source: "test" }
}

/** 150 yen to the dollar on 5 November, 160 on 7 November; nothing else. Records each ask. */
function rates() {
  const asked: string[] = []
  const lookup: EntryRateLookup = (from, to, date) => {
    asked.push(`${from}:${to}:${date}`)
    const value = from === "USD" && to === "JPY"
      ? { "2026-11-05": "150", "2026-11-07": "160" }[date]
      : undefined
    return Promise.resolve(value === undefined ? null : rate(from, to, value, date))
  }
  return { asked, lookup }
}

function fields(overrides: Partial<TransferFields> = {}): TransferFields {
  return {
    fromAccountId: card,
    toAccountId: yen,
    sentAmount: 10000,
    memo: "",
    date: "2026-11-05",
    ...overrides,
  }
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

async function asyncCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return await promise.then(() => undefined, (error) => (error as { code?: string }).code)
}

describe("transfer requests", () => {
  it("take two accounts, a positive sent amount and an optional received one", () => {
    expect(parseTransferRequest(transferCreatePayloadSchema, { ...base, memo: "  ATM  " }))
      .toEqual({ ...base, memo: "ATM" })
    expect(
      parseTransferRequest(transferCreatePayloadSchema, { ...base, receivedAmount: 1500000 }),
    ).toMatchObject({ receivedAmount: 1500000 })
  })

  it("refuse a zero, negative, fractional or unsafe amount on either side (R1, R3)", () => {
    for (
      const amounts of [
        { sentAmount: 0 },
        { sentAmount: -100 },
        { sentAmount: 12.5 },
        { sentAmount: Number.MAX_SAFE_INTEGER + 2 },
        { receivedAmount: 0 },
        { receivedAmount: -1 },
      ]
    ) {
      expect(
        codeOf(() => parseTransferRequest(transferCreatePayloadSchema, { ...base, ...amounts })),
      )
        .toBe("INVALID_REQUEST")
    }
  })

  it("refuse every field the server sets, and a category, which a transfer never has (R12, R18)", () => {
    for (
      const extra of [
        { converted: true },
        { createdByUserId: 1 },
        { categoryId: card },
        { kind: 1 },
        { version: 1 },
      ]
    ) {
      expect(codeOf(() => parseTransferRequest(transferCreatePayloadSchema, { ...base, ...extra })))
        .toBe("INVALID_REQUEST")
    }
  })

  it("refuse an edit without its memo, its date or its version", () => {
    const edit = { ...base, memo: "", date: "2026-11-05", version: 1 }
    expect(parseTransferRequest(transferUpdatePayloadSchema, edit)).toEqual(edit)
    for (const field of ["memo", "date", "version"]) {
      const { [field]: _left, ...rest } = edit as Record<string, unknown>
      expect(codeOf(() => parseTransferRequest(transferUpdatePayloadSchema, rest)))
        .toBe("INVALID_REQUEST")
    }
  })

  it("refuse a memo past the limit or with a control character, and keep a line break", () => {
    const long = "€".repeat(TRANSFER_MEMO_MAX_LENGTH + 1)
    expect(codeOf(() => parseTransferRequest(transferCreatePayloadSchema, { ...base, memo: long })))
      .toBe("INVALID_REQUEST")
    expect(
      codeOf(() =>
        parseTransferRequest(transferCreatePayloadSchema, { ...base, memo: "a\u0000b" })
      ),
    ).toBe("INVALID_REQUEST")
    expect(
      parseTransferRequest(transferCreatePayloadSchema, { ...base, memo: "a\nb" }).memo,
    ).toBe("a\nb")
  })

  it("refuse a date the calendar does not have", () => {
    expect(
      codeOf(() =>
        parseTransferRequest(transferCreatePayloadSchema, { ...base, date: "2026-02-30" })
      ),
    ).toBe("INVALID_REQUEST")
  })
})

describe("transfer authorization", () => {
  it("lets every member read and an editor or above write (R16)", () => {
    for (const role of [GroupRole.VIEWER, GroupRole.EDITOR, GroupRole.ADMIN, GroupRole.OWNER]) {
      expect(() => assertCanReadTransfers(role)).not.toThrow()
    }
    expect(codeOf(() => assertCanWriteTransfers(GroupRole.VIEWER))).toBe("ROLE_INSUFFICIENT")
    for (const role of [GroupRole.EDITOR, GroupRole.ADMIN, GroupRole.OWNER]) {
      expect(() => assertCanWriteTransfers(role)).not.toThrow()
    }
  })

  it("tells a stranger the household does not exist", () => {
    expect(codeOf(() => assertCanReadTransfers(null))).toBe("GROUP_NOT_FOUND")
    expect(codeOf(() => assertCanWriteTransfers(null))).toBe("GROUP_NOT_FOUND")
  })
})

describe("transfer references", () => {
  const both = { from: { currency: "USD" }, to: { currency: "JPY" } }

  it("refuse a transfer from an account to itself", () => {
    expect(codeOf(() => assertTransferReferences({ fromAccountId: card, toAccountId: card }, both)))
      .toBe("TRANSFER_SAME_ACCOUNT")
  })

  it("answer a missing account on either side as not found (R17)", () => {
    const ids = { fromAccountId: card, toAccountId: cash }
    expect(codeOf(() => assertTransferReferences(ids, { ...both, from: null })))
      .toBe("ACCOUNT_NOT_FOUND")
    expect(codeOf(() => assertTransferReferences(ids, { ...both, to: null })))
      .toBe("ACCOUNT_NOT_FOUND")
    expect(() => assertTransferReferences(ids, both)).not.toThrow()
  })
})

describe("transfer amounts", () => {
  it("in one currency, set the received amount to the sent one and ask for no rate", async () => {
    const { asked, lookup } = rates()
    expect(
      await deriveTransferAmounts(fields({ toAccountId: cash }), "USD", "USD", null, lookup),
    ).toEqual({ sentAmount: 10000, receivedAmount: 10000, converted: false })
    expect(
      await deriveTransferAmounts(
        fields({ toAccountId: cash, receivedAmount: 10000 }),
        "USD",
        "USD",
        null,
        lookup,
      ),
    ).toEqual({ sentAmount: 10000, receivedAmount: 10000, converted: false })
    expect(asked).toEqual([])
  })

  it("in one currency, refuse a stated received amount that differs from the sent one", async () => {
    expect(
      await asyncCodeOf(
        deriveTransferAmounts(fields({ receivedAmount: 9000 }), "USD", "USD", null, rates().lookup),
      ),
    ).toBe("INVALID_REQUEST")
  })

  it("across currencies, keep a stated received amount as the rate the bank charged", async () => {
    const { asked, lookup } = rates()
    expect(
      await deriveTransferAmounts(fields({ receivedAmount: 1450000 }), "USD", "JPY", null, lookup),
    ).toEqual({ sentAmount: 10000, receivedAmount: 1450000, converted: false })
    expect(asked).toEqual([])
  })

  it("across currencies, fill the received amount at the rate of the transfer's date (R6)", async () => {
    const { asked, lookup } = rates()
    // 100.00 USD at 150 yen is ¥15000; yen have no decimals.
    expect(await deriveTransferAmounts(fields(), "USD", "JPY", null, lookup)).toEqual({
      sentAmount: 10000,
      receivedAmount: 15000,
      converted: true,
    })
    expect(asked).toEqual(["USD:JPY:2026-11-05"])
  })

  it("answer NO_RATE when the transfer's date has no rate", async () => {
    expect(
      await asyncCodeOf(
        deriveTransferAmounts(fields({ date: "2026-11-01" }), "USD", "JPY", null, rates().lookup),
      ),
    ).toBe("NO_RATE")
  })

  it("refuse a received amount that rounds to zero, or one past the safe bound", async () => {
    const tiny: EntryRateLookup = (from, to, date) =>
      Promise.resolve(rate(from, to, "0.0001", date))
    expect(
      await asyncCodeOf(deriveTransferAmounts(fields({ sentAmount: 1 }), "USD", "JPY", null, tiny)),
    ).toBe("INVALID_REQUEST")
    const huge: EntryRateLookup = (from, to, date) =>
      Promise.resolve(rate(from, to, "1000000000", date))
    expect(
      await asyncCodeOf(
        deriveTransferAmounts(fields({ sentAmount: 9_000_000_000_000 }), "USD", "JPY", null, huge),
      ),
    ).toBe("INVALID_REQUEST")
  })

  it("keep the stored received amount on an edit that changes neither account, the sent amount nor the date", async () => {
    const { asked, lookup } = rates()
    const previous = {
      fromAccountId: card,
      toAccountId: yen,
      sentAmount: 10000,
      date: "2026-11-05",
      receivedAmount: 14800,
      converted: false,
    }
    expect(await deriveTransferAmounts(fields({ memo: "ATM" }), "USD", "JPY", previous, lookup))
      .toEqual({ sentAmount: 10000, receivedAmount: 14800, converted: false })
    expect(asked).toEqual([])
  })

  it("recompute the yen at the transfer date's rate when the sent dollars change, never storing ¥200 (legacy §4 item 6)", async () => {
    const { lookup } = rates()
    const previous = {
      fromAccountId: card,
      toAccountId: yen,
      sentAmount: 10000,
      date: "2026-11-05",
      receivedAmount: 15000,
      converted: true,
    }
    expect(
      await deriveTransferAmounts(fields({ sentAmount: 20000 }), "USD", "JPY", previous, lookup),
    ).toEqual({ sentAmount: 20000, receivedAmount: 30000, converted: true })
  })

  it("convert again at the new date's rate when the date or an account changes", async () => {
    const { asked, lookup } = rates()
    const previous = {
      fromAccountId: card,
      toAccountId: yen,
      sentAmount: 10000,
      date: "2026-11-05",
      receivedAmount: 14000,
      converted: false,
    }
    expect(
      await deriveTransferAmounts(fields({ date: "2026-11-07" }), "USD", "JPY", previous, lookup),
    ).toEqual({ sentAmount: 10000, receivedAmount: 16000, converted: true })
    const other = "019a5b0e-1af5-7f04-8ae4-b1ee5d112009"
    expect(
      await deriveTransferAmounts(fields({ fromAccountId: other }), "USD", "JPY", previous, lookup),
    ).toEqual({ sentAmount: 10000, receivedAmount: 15000, converted: true })
    expect(
      await deriveTransferAmounts(fields({ toAccountId: other }), "USD", "JPY", previous, lookup),
    ).toEqual({ sentAmount: 10000, receivedAmount: 15000, converted: true })
    expect(asked).toEqual(["USD:JPY:2026-11-07", "USD:JPY:2026-11-05", "USD:JPY:2026-11-05"])
  })

  it("keep a received amount stated in the same edit that changes the sent one", async () => {
    const previous = {
      fromAccountId: card,
      toAccountId: yen,
      sentAmount: 10000,
      date: "2026-11-05",
      receivedAmount: 15000,
      converted: true,
    }
    expect(
      await deriveTransferAmounts(
        fields({ sentAmount: 20000, receivedAmount: 29000 }),
        "USD",
        "JPY",
        previous,
        rates().lookup,
      ),
    ).toEqual({ sentAmount: 20000, receivedAmount: 29000, converted: false })
  })
})
