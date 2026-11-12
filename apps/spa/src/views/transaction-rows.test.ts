/** `transactionRow` and the delete toast: how a stored entry becomes what the screens draw. */
import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import { CategoryKind } from "@domain/categories"
import { TransactionKind } from "@domain/transactions"
import app from "@i18n/app/en.ts"
import type { TransactionItem } from "../state/transactions.ts"
import { type RowContext, transactionRow, transactionUndoText } from "./transaction-rows.ts"

/** The `app` catalog's English, as a screen without a provider reads it. */
const EN = createTranslator({ language: `en`, catalogs: [{ source: app }] })

const context: RowContext = {
  t: EN,
  accounts: [{ id: "a-eur", name: "Wallet", currency: "EUR", archived: false }],
  categories: [
    { id: "c-food", name: "Food", parentId: null, kind: CategoryKind.EXPENSE, archived: false },
    {
      id: "c-coffee",
      name: "Coffee",
      parentId: "c-food",
      kind: CategoryKind.EXPENSE,
      archived: false,
    },
  ],
  youId: 1,
  members: [{ userId: 7, name: "Maya Chen" }],
}

const entry: TransactionItem = {
  id: "t-1",
  groupId: "g-1",
  accountId: "a-eur",
  categoryId: "c-coffee",
  kind: TransactionKind.EXPENSE,
  accountAmount: -450,
  amount: -450,
  currency: "EUR",
  converted: false,
  memo: "Latte",
  date: "2026-11-13",
  version: 1,
  changeSequence: "1",
  createdByUserId: 7,
  updatedByUserId: 7,
  createdAt: "2026-11-13T08:00:00.000Z",
  updatedAt: "2026-11-13T08:00:00.000Z",
}

describe("transactionRow", () => {
  it("names the account, the category with its parent, and the member who added it", () => {
    const row = transactionRow(entry, context)
    expect(row.accountName).toBe("Wallet")
    expect(row.accountCurrency).toBe("EUR")
    expect(row.categoryName).toBe("Food › Coffee")
    expect(row.categoryParentId).toBe("c-food")
    expect(row.author).toBe("Maya Chen")
    expect(row.queued).toBe(false)
  })

  it("shows an account or category the device does not know as Unknown, with no second amount", () => {
    const row = transactionRow(
      { ...entry, accountId: "a-gone", categoryId: "c-gone", currency: "USD" },
      context,
    )
    expect(row.accountName).toBe("Unknown")
    expect(row.categoryName).toBe("Unknown")
    expect(row.accountCurrency).toBe("USD")
  })

  it("marks an entry the server has not taken yet as queued", () => {
    expect(transactionRow({ ...entry, version: 0 }, context).queued).toBe(true)
  })
})

describe("transactionUndoText", () => {
  it("names the deleted entry by its amount and category", () => {
    const { accounts, categories, youId, members } = context
    const text = transactionUndoText({ accounts, categories, youId, members }, "en")
    const body = text.body(EN, { transaction: entry } as never).replace(/[⁨⁩]/g, "")
    expect(text.title(EN, { transaction: entry } as never)).toBe("Transaction deleted")
    expect(body).toBe("€4.50 in Food › Coffee is deleted.")
  })
})
