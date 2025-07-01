import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Transaction, WebSocketMessageType } from "@shared/types"
import { toast } from "./toast.ts"

const list = signal<Transaction[]>([])
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

export const transaction = {
  list,
  ops,
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "transaction") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          transaction.list.value = Array.isArray(msg.p) ? (msg.p as Transaction[]) : []
          break
        case WebSocketMessageType.CREATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const newTransactions = p.filter(Boolean) as Transaction[]
          if (newTransactions.length > 0) {
            transaction.list.value = [...transaction.list.value, ...newTransactions]
          }
          transaction.ops.create.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.UPDATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const updatedTransactions = p.filter(Boolean) as Transaction[]
          if (updatedTransactions.length > 0) {
            transaction.list.value = transaction.list.value.map((t) => {
              const updated = updatedTransactions.find((updated) => updated.id === t.id)
              return updated ? updated : t
            })
          }
          transaction.ops.update.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.DELETED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const deletedTransactions = p.filter(Boolean) as Transaction[]
          if (deletedTransactions.length > 0) {
            // Update the items in place (soft delete) instead of removing from list
            transaction.list.value = transaction.list.value.map((t) => {
              const deleted = deletedTransactions.find((deleted) => deleted.id === t.id)
              return deleted ? deleted : t
            })
          }
          transaction.ops.delete.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.ERROR_VALIDATION: {
          const errorMsg = Array.isArray(msg.p) && typeof msg.p[0] === "string"
            ? msg.p[0]
            : "Validation error"
          if (transaction.ops.create.value.inProgress) {
            transaction.ops.create.value = { inProgress: false, error: errorMsg }
          }
          if (transaction.ops.update.value.inProgress) {
            transaction.ops.update.value = { inProgress: false, error: errorMsg }
          }
          if (transaction.ops.delete.value.inProgress) {
            transaction.ops.delete.value = { inProgress: false, error: errorMsg }
          }
          toast.error({ body: errorMsg })
          break
        }
      }
    })
  },
  create(data: {
    groupId: number
    accountId: number
    categoryId: number
    direction?: number // Optional - backend will auto-determine from type
    type: number
    amount: number
    memo?: string
    originalCurrencyId?: number
    originalAmount?: number
    timestamp?: Date
  }) {
    transaction.ops.create.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "transaction",
        t: WebSocketMessageType.CREATE,
        p: [data],
      },
    })
  },
  update(id: number, data: {
    accountId?: number
    categoryId?: number
    direction?: number
    type?: number
    amount?: number
    memo?: string
    originalCurrencyId?: number
    originalAmount?: number
    timestamp?: Date
  }) {
    transaction.ops.update.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "transaction",
        t: WebSocketMessageType.UPDATE,
        p: [{ id, ...data }],
      },
    })
  },
  remove(id: number) {
    transaction.ops.delete.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "transaction",
        t: WebSocketMessageType.DELETE,
        p: [{ id }],
      },
    })
  },
  undelete(id: number) {
    transaction.ops.update.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "transaction",
        t: WebSocketMessageType.UNDELETE,
        p: [{ id }],
      },
    })
  },
}
