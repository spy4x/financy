import type { OutboxEntry } from "@spy4x/realtime/outbox"
import type { TransactionKind } from "@domain/transactions"
import type { TransactionItem } from "../state/transactions.ts"
import { databasePrefix } from "./notes-cache.ts"

/** What the person entered in a queued entry write: the outbox's payload. */
export interface TransactionPayload {
  groupId: string
  accountId: string
  categoryId: string
  kind: TransactionKind
  /** What was paid, positive, in `currency`'s smallest unit. */
  amount: number
  currency: string
  /**
   * What moved in the account, positive, when the person stated it (a manual rate); `null` lets the
   * server convert at the date's rate, or keep the amount it had.
   */
  accountAmount: number | null
  memo: string
  date: string
  /**
   * The account's currency when the write was queued. It stays on the device: the row a queued
   * entry shows as needs it to tell a converted entry from one in the account's own currency.
   */
  accountCurrency: string
}

/** One queued entry write, as the outbox from `@spy4x/realtime/outbox` keeps it. */
export type TransactionEntry = OutboxEntry<TransactionPayload, TransactionItem>

/** The entries the server sent, kept on this device for one signed-in user, as `NotesCache`. */
export interface TransactionsCache {
  /** A household's live entries on the device, the latest date first. */
  readTransactions(groupId: string): Promise<TransactionItem[]>
  putTransaction(transaction: TransactionItem): Promise<void>
  removeTransaction(transactionId: string): Promise<void>
  /** Drops every entry. The queue is another database and stays, as with the notes. */
  clear(): Promise<void>
}

/** The latest date first, then the latest written: the order of the entries list. */
export function byDate(a: TransactionItem, b: TransactionItem): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** The name of the queue database of one user's entries. */
export function transactionsQueueDatabase(userId: number): string {
  return `${databasePrefix(userId)}:transactions-outbox`
}
