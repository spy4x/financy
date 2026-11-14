import type { JSX } from "preact"
import { MoneyDisplay } from "@spy4x/preact-ui/money-display"
import type { CategoryKind } from "@domain/categories"
import type { TransactionKind } from "@domain/transactions"
import { amountDecimals } from "@domain/money"

/** One entry as the transaction screens show it: the stored fields plus the names they point at. */
export interface TransactionRow {
  id: string
  kind: TransactionKind
  /** Signed, in `currency`'s smallest unit: an expense is negative. */
  amount: number
  currency: string
  /** Signed, in the account's currency; `0` while a queued converted entry waits for its rate. */
  accountAmount: number
  accountCurrency: string
  converted: boolean
  memo: string
  /** `YYYY-MM-DD`. */
  date: string
  accountId: string
  accountName: string
  categoryId: string
  /** The category's parent, so a filter on a parent finds its subcategories' entries. */
  categoryParentId: string | null
  /** "Food › Coffee" for a subcategory. */
  categoryName: string
  /** "You", the member's name, or `undefined` while the members are not read. */
  author?: string
  /** Not on the server yet: it waits in this device's queue. */
  queued: boolean
  /**
   * The server refused this queued entry because its account or category was deleted: it waits
   * for the person to pick another one or discard it.
   */
  gone?: "account" | "category" | null
  createdAt: string
  /** When it was deleted, in the deleted view. */
  deletedAt?: string | null
}

/** A category as the screens list it. */
export interface TransactionCategory {
  id: string
  name: string
  parentId: string | null
  kind: CategoryKind
  archived: boolean
}

/** An account as the screens list it. */
export interface TransactionAccount {
  id: string
  name: string
  currency: string
  archived: boolean
}

/** "Food › Coffee" for a subcategory, the name alone for a top-level one. */
export function categoryLabel(
  category: TransactionCategory,
  all: readonly TransactionCategory[],
): string {
  const parent = category.parentId === null
    ? undefined
    : all.find((candidate) => candidate.id === category.parentId)
  return parent ? `${parent.name} › ${category.name}` : category.name
}

/**
 * One transfer as the transactions list shows it: money moved between two of the household's own
 * accounts, each side in its account's currency.
 */
export interface TransferRow {
  id: string
  fromAccountId: string
  fromAccountName: string
  fromCurrency: string
  /** Positive, in `fromCurrency`'s smallest unit. */
  sentAmount: number
  toAccountId: string
  toAccountName: string
  toCurrency: string
  /** Positive, in `toCurrency`'s smallest unit. */
  receivedAmount: number
  /** The server converted the received amount at the date's rate. */
  converted: boolean
  memo: string
  /** `YYYY-MM-DD`. */
  date: string
  /** "You", the member's name, or `undefined` while the members are not read. */
  author?: string
  createdAt: string
}

/** A row of the transactions list: an entry or a transfer. */
export type ListRow = TransactionRow | TransferRow

/** Whether a list row is a transfer. */
export function isTransfer(row: ListRow): row is TransferRow {
  return `fromAccountId` in row
}

/** The kind filter's value for transfers, `?kind=3`, next to Expense (1) and Income (2). */
export const TRANSFERS_KIND = 3

/** What the kind filter can hold: an entry kind or {@link TRANSFERS_KIND}. */
export type ListKind = TransactionKind | typeof TRANSFERS_KIND

/** The list's filters, as the address holds them. */
export interface TransactionFilters {
  q: string
  accountId: string | null
  categoryId: string | null
  kind: ListKind | null
  /** `YYYY-MM-DD` or `""`, inclusive. */
  from: string
  to: string
}

export const NO_FILTERS: TransactionFilters = {
  q: "",
  accountId: null,
  categoryId: null,
  kind: null,
  from: "",
  to: "",
}

/** Whether any filter other than the search is set. */
export function hasFilters(filters: TransactionFilters): boolean {
  return filters.accountId !== null || filters.categoryId !== null || filters.kind !== null ||
    filters.from !== "" || filters.to !== ""
}

/**
 * The rows the filters keep, in their order. The search looks in memos, ignoring case; a
 * category keeps its subcategories' entries too; the dates are inclusive. A transfer has no
 * category and is neither an expense nor an income, so a category filter, Expense and Income all
 * leave it out; the account filter keeps it when either side is that account.
 */
export function filterTransactions<Row extends ListRow>(
  rows: readonly Row[],
  filters: TransactionFilters,
): Row[] {
  const words = filters.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (isTransfer(row)) {
      if (filters.categoryId !== null) return false
      if (filters.kind !== null && filters.kind !== TRANSFERS_KIND) return false
      if (
        filters.accountId !== null && row.fromAccountId !== filters.accountId &&
        row.toAccountId !== filters.accountId
      ) return false
    } else {
      if (filters.accountId !== null && row.accountId !== filters.accountId) return false
      if (
        filters.categoryId !== null && row.categoryId !== filters.categoryId &&
        row.categoryParentId !== filters.categoryId
      ) return false
      if (filters.kind !== null && row.kind !== filters.kind) return false
    }
    if (filters.from !== "" && row.date < filters.from) return false
    if (filters.to !== "" && row.date > filters.to) return false
    const memo = row.memo.toLocaleLowerCase()
    return words.every((word) => memo.includes(word))
  })
}

/** The rows split by day, newest day first, keeping the rows' own order within a day. */
export function byDay<Row extends { date: string }>(
  rows: readonly Row[],
): { date: string; rows: Row[] }[] {
  const days: { date: string; rows: Row[] }[] = []
  for (const row of rows) {
    const last = days.at(-1)
    if (last?.date === row.date) last.rows.push(row)
    else days.push({ date: row.date, rows: [row] })
  }
  return days
}

/**
 * An entry's amount: an income with "+" in the success colour, an expense with "−" in the ink,
 * in tabular figures.
 */
export function EntryAmount(
  { amount, currency, class: className = "" }: { amount: number; currency: string; class?: string },
): JSX.Element {
  return (
    <MoneyDisplay
      amount={amount}
      currency={currency}
      decimals={amountDecimals(currency)}
      tone={amount > 0 ? "signed" : "plain"}
      class={`tabular-nums ${className}`}
    />
  )
}
