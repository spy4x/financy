import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Account, WebSocketMessageType } from "@shared/types"
import { group } from "./group.ts"
import { toast } from "./toast.ts"

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

export const account = {
  list,
  ops,
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "account") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          account.list.value = Array.isArray(msg.p) ? (msg.p as Account[]) : []
          break
        case WebSocketMessageType.CREATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) account.list.value = [...account.list.value, p[0] as Account]
          account.ops.create.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.UPDATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            account.list.value = account.list.value.map((a) =>
              a.id === (p[0] as Account).id ? p[0] as Account : a
            )
          }
          account.ops.update.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.DELETED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            account.list.value = account.list.value.filter((a) => a.id !== (p[0] as Account).id)
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
  },
  create(name: string, currency: string) {
    const groupId = group.selectedId.value
    if (!groupId) {
      toast.error({ body: "Please select a group first." })
      return
    }
    account.ops.create.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "account",
        t: WebSocketMessageType.CREATE,
        p: [{ name, currency, groupId, balance: 0 }],
      },
    })
  },
  update(id: number, name: string, currency: string) {
    account.ops.update.value = { inProgress: true, error: null }
    ws.request({
      message: { e: "account", t: WebSocketMessageType.UPDATE, p: [{ id, name, currency }] },
    })
  },
  remove(id: number) {
    account.ops.delete.value = { inProgress: true, error: null }
    ws.request({ message: { e: "account", t: WebSocketMessageType.DELETE, p: [{ id }] } })
  },
}
