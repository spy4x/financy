import type { TransactionItem } from "./transactions.ts"

/**
 * The order of the entries list, transfers included: the latest date first, then the latest
 * written. It lives outside `../offline/` because the store sorts with it too, and the store must
 * work with that folder removed (ADR 003).
 */
export function byDate(
  a: Pick<TransactionItem, "date" | "createdAt" | "id">,
  b: Pick<TransactionItem, "date" | "createdAt" | "id">,
): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}
