import type { TransactionItem } from "../state/transactions.ts"
import { byDate, type TransactionsCache } from "./transactions-cache.ts"

/** A `TransactionsCache` in memory, for the tests of the offline layer: Deno has no IndexedDB. */
export function createMemoryTransactionsCache(): TransactionsCache {
  let rows: TransactionItem[] = []
  return {
    readTransactions: (groupId) =>
      Promise.resolve(
        rows.filter((row) => row.groupId === groupId).map((row) => ({ ...row })).sort(byDate),
      ),
    putTransaction(transaction) {
      rows = [{ ...transaction }, ...rows.filter((row) => row.id !== transaction.id)]
      return Promise.resolve()
    },
    removeTransaction(transactionId) {
      rows = rows.filter((row) => row.id !== transactionId)
      return Promise.resolve()
    },
    clear() {
      rows = []
      return Promise.resolve()
    },
  }
}
