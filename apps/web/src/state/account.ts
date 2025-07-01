import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Account, WebSocketMessageType } from "@shared/types"
import { group } from "./group.ts"
import { toast } from "./toast.ts"
import { transaction } from "./transaction.ts"

const list = signal<Account[]>([])
const ops = {
  create: signal<{ inProgress: boolean; error?: string | null }>({
    inProgress: false,
    error: null,
  }),
  update: signal<{ inProgress: boolean; error?: string | null }>({
    inProgress: false,
    error: null,
  }),
  delete: signal<{ inProgress: boolean; error?: string | null }>({
    inProgress: false,
    error: null,
  }),
}

// Memoization cache for account balances
const balanceCache = new Map<number, number>()

export const account = {
  list,
  ops,
  /**
   * Get current balance for an account (derived from startingBalance + transactions, memoized)
   */
  getCurrentBalance(accountId: number) {
    if (balanceCache.has(accountId)) {
      console.log("Cached", accountId)
      return balanceCache.get(accountId)!
    }
    console.log("Calculating", accountId)
    const accountData = list.value.find((acc) => acc.id === accountId)
    if (!accountData) return 0

    const balance = transaction.list.value.reduce((sum, txn) => {
      if (txn.accountId === accountId && !txn.deletedAt) {
        // Transactions are already signed correctly based on direction
        return sum + txn.amount
      }
      return sum
    }, accountData.startingBalance)

    balanceCache.set(accountId, balance)
    return balance
  },
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "account") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          account.list.value = Array.isArray(msg.p) ? (msg.p as Account[]) : []
          balanceCache.clear()
          break
        case WebSocketMessageType.CREATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const newAccounts = p.filter(Boolean) as Account[]
          if (newAccounts.length > 0) {
            account.list.value = [...account.list.value, ...newAccounts]
          }
          account.ops.create.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.UPDATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const updatedAccounts = p.filter(Boolean) as Account[]
          if (updatedAccounts.length > 0) {
            account.list.value = account.list.value.map((a) => {
              const updated = updatedAccounts.find((updated) => updated.id === a.id)
              return updated ? updated : a
            })
          }
          account.ops.update.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.DELETED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const deletedAccounts = p.filter(Boolean) as Account[]
          if (deletedAccounts.length > 0) {
            // Update the items in place (soft delete) instead of removing from list
            account.list.value = account.list.value.map((a) => {
              const deleted = deletedAccounts.find((deleted) => deleted.id === a.id)
              return deleted ? deleted : a
            })
            deletedAccounts.forEach((a) => balanceCache.delete(a.id))
          }
          account.ops.delete.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.ERROR_VALIDATION: {
          const errorMsg = Array.isArray(msg.p) && typeof msg.p[0] === "string"
            ? msg.p[0]
            : "Validation error"
          if (account.ops.create.value.inProgress) {
            account.ops.create.value = { inProgress: false, error: errorMsg }
          }
          if (account.ops.update.value.inProgress) {
            account.ops.update.value = { inProgress: false, error: errorMsg }
          }
          if (account.ops.delete.value.inProgress) {
            account.ops.delete.value = { inProgress: false, error: errorMsg }
          }
          toast.error({ body: errorMsg })
          break
        }
      }
    })

    // Invalidate balance cache for affected account(s) on transaction changes
    transaction.list.subscribe((txns) => {
      // Find all accountIds affected by changed transactions
      const affectedAccountIds = new Set<number>(txns.map((txn) => txn.accountId))
      // Remove cache for all affected accounts
      affectedAccountIds.forEach((id) => balanceCache.delete(id))
    })
  },
  create(name: string, currencyId: number, startingBalance: number = 0) {
    const groupId = group.selectedId.value
    account.ops.create.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "account",
        t: WebSocketMessageType.CREATE,
        p: [{ name, currencyId, groupId, startingBalance }],
      },
    })
  },
  update(id: number, name: string, currencyId: number, startingBalance?: number) {
    account.ops.update.value = { inProgress: true, error: null }
    const updates: { id: number; name: string; currencyId: number; startingBalance?: number } = {
      id,
      name,
      currencyId,
    }
    if (startingBalance !== undefined) {
      updates.startingBalance = startingBalance
    }
    ws.request({
      message: { e: "account", t: WebSocketMessageType.UPDATE, p: [updates] },
    })
  },
  remove(id: number) {
    account.ops.delete.value = { inProgress: true, error: null }
    ws.request({ message: { e: "account", t: WebSocketMessageType.DELETE, p: [{ id }] } })
  },
  undelete(id: number) {
    account.ops.update.value = { inProgress: true, error: null }
    ws.request({ message: { e: "account", t: WebSocketMessageType.UNDELETE, p: [{ id }] } })
  },
  transfer(
    fromAccountId: number,
    toAccountId: number,
    amount: number,
    memo?: string,
    timestamp?: Date,
  ) {
    // TODO: Add transfer operation state tracking if needed
    ws.request({
      message: {
        e: "account",
        t: WebSocketMessageType.TRANSFER,
        p: [{
          fromAccountId,
          toAccountId,
          amount,
          memo,
          timestamp,
        }],
      },
    })
  },
}
