import type { Translator } from "@spy4x/platform/universal/i18n"
import { formatMoney } from "@spy4x/platform/universal/money-core"
import { isolate } from "@spy4x/preact-ui/bdi"
import { amountDecimals } from "@domain/money"
import {
  categoryLabel,
  type TransactionAccount,
  type TransactionCategory,
  type TransactionRow,
} from "@ui/transaction-parts.tsx"
import type { AccountItem } from "../state/accounts.ts"
import type { CategoryItem } from "../state/categories.ts"
import type { TransactionItem, TransactionUndoOffer } from "../state/transactions.ts"
import { type NotePerson, personName } from "./note-people.ts"
import type { UndoText } from "./use-undo-toast.ts"

export function transactionAccounts(accounts: readonly AccountItem[]): TransactionAccount[] {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    currency: account.currency,
    archived: account.archivedAt !== null,
  }))
}

export function transactionCategories(
  categories: readonly CategoryItem[],
): TransactionCategory[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    parentId: category.parentId,
    kind: category.kind,
    archived: category.archivedAt !== null,
  }))
}

/** What the screens need to name an entry's account, category and author. */
export interface RowContext {
  t: Translator<string>
  accounts: readonly TransactionAccount[]
  categories: readonly TransactionCategory[]
  youId: number | null
  members: readonly NotePerson[] | null
}

/**
 * An entry as the screens draw it. An account or category the device does not know (deleted on
 * another device, not read yet) shows as "Unknown" rather than an empty line.
 */
export function transactionRow(entry: TransactionItem, context: RowContext): TransactionRow {
  const account = context.accounts.find((candidate) => candidate.id === entry.accountId)
  const category = context.categories.find((candidate) => candidate.id === entry.categoryId)
  return {
    id: entry.id,
    kind: entry.kind,
    amount: entry.amount,
    currency: entry.currency,
    accountAmount: entry.accountAmount,
    // Without the account, its currency is unknown: the entry's own is the honest guess, and it
    // hides a second amount that could not be named.
    accountCurrency: account?.currency ?? entry.currency,
    converted: entry.converted,
    memo: entry.memo,
    date: entry.date,
    accountId: entry.accountId,
    accountName: account?.name ?? context.t.t(`Transactions.unknown`),
    categoryId: entry.categoryId,
    categoryParentId: category?.parentId ?? null,
    categoryName: category
      ? categoryLabel(category, context.categories)
      : context.t.t(`Transactions.unknown`),
    author: personName(context.t, entry.createdByUserId, context.youId, context.members),
    queued: entry.version === 0,
    createdAt: entry.createdAt,
    deletedAt: entry.deletedAt ?? null,
  }
}

/** "€4.50 in Coffee", for the toasts and the restore button. */
export function amountInCategory(
  t: Translator<string>,
  row: TransactionRow,
  locale: string,
): string {
  return t.t(`Transactions.amountInCategory`, {
    amount: isolate(
      formatMoney(Math.abs(row.amount), row.currency, locale, {
        decimals: amountDecimals(row.currency),
      }),
    ),
    category: isolate(row.categoryName),
  })
}

/** The Undo toast after a delete: "Transaction deleted · €4.50 in Coffee is deleted." */
export function transactionUndoText(
  context: Omit<RowContext, "t">,
  locale: string,
): UndoText<TransactionUndoOffer> {
  return {
    e2e: `transaction`,
    title: (t) => t.t(`TransactionToasts.deletedTitle`),
    body: (t, offer) =>
      t.t(`TransactionToasts.deleted`, {
        what: amountInCategory(t, transactionRow(offer.transaction, { ...context, t }), locale),
      }),
  }
}
