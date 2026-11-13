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

/** The list's filters, as the address holds them. */
export interface TransactionFilters {
  q: string
  accountId: string | null
  categoryId: string | null
  kind: TransactionKind | null
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
 * category keeps its subcategories' entries too; the dates are inclusive.
 */
export function filterTransactions(
  rows: readonly TransactionRow[],
  filters: TransactionFilters,
): TransactionRow[] {
  const words = filters.q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (filters.accountId !== null && row.accountId !== filters.accountId) return false
    if (
      filters.categoryId !== null && row.categoryId !== filters.categoryId &&
      row.categoryParentId !== filters.categoryId
    ) return false
    if (filters.kind !== null && row.kind !== filters.kind) return false
    if (filters.from !== "" && row.date < filters.from) return false
    if (filters.to !== "" && row.date > filters.to) return false
    const memo = row.memo.toLocaleLowerCase()
    return words.every((word) => memo.includes(word))
  })
}

/** The rows split by day, newest day first, keeping the rows' own order within a day. */
export function byDay(rows: readonly TransactionRow[]): { date: string; rows: TransactionRow[] }[] {
  const days: { date: string; rows: TransactionRow[] }[] = []
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
