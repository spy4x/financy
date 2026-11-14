import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import app from "@i18n/app/en.ts"
import type { TransferItem } from "../state/transfers.ts"
import { transferRow, transferUndoText } from "./transfer-rows.ts"

const t = createTranslator({ language: `en`, catalogs: [{ source: app }] })
const card = { id: "a-usd", name: "Card", currency: "USD", archived: false }
const wallet = { id: "a-eur", name: "Wallet", currency: "EUR", archived: false }

const transfer: TransferItem = {
  id: "tr-1",
  groupId: "g-1",
  fromAccountId: card.id,
  sentAmount: 20000,
  toAccountId: wallet.id,
  receivedAmount: 18500,
  converted: true,
  memo: "ATM",
  date: "2026-11-13",
  version: 1,
  changeSequence: "1",
  createdByUserId: 2,
  updatedByUserId: 2,
  createdAt: "2026-11-13T09:00:00.000Z",
  updatedAt: "2026-11-13T09:00:00.000Z",
}
const context = {
  t,
  accounts: [card, wallet],
  youId: 1,
  members: [{ userId: 2, name: "Anna" }],
}

describe("transferRow", () => {
  it("names both accounts, their currencies and who added the transfer", () => {
    const row = transferRow(transfer, context)
    expect([row.fromAccountName, row.fromCurrency, row.toAccountName, row.toCurrency])
      .toEqual(["Card", "USD", "Wallet", "EUR"])
    expect(row.author).toBe("Anna")
  })

  it("calls an account the device does not know Unknown, in the other side's currency", () => {
    const row = transferRow(transfer, { ...context, accounts: [wallet] })
    expect(row.fromAccountName).toBe("Unknown")
    expect(row.fromCurrency).toBe("EUR")
    expect(row.toCurrency).toBe("EUR")
  })
})

describe("transferUndoText", () => {
  it("names the deleted transfer's amount and accounts in the Undo toast", () => {
    const offer = { id: transfer.id, transfer, until: 0 }
    const text = transferUndoText(context, "en-GB")
    expect(text.title(t, offer)).toBe("Transfer deleted")
    expect(text.body(t, offer).replace(/[⁨⁩]/g, ""))
      .toContain("US$200.00 from Card to Wallet")
  })
})
