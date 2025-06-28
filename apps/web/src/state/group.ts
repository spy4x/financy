import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Group, type, WebSocketMessageType } from "@shared/types"
import { toast } from "./toast.ts"
import { makeStorage } from "@shared/local-storage"
import { effect } from "@preact/signals"
import { currency } from "./currency.ts"

// Holds the list of groups for the current user
const list = signal<Group[]>([])

// Holds the currently selected groupId (default: first group)
const selectedIdStorage = makeStorage<number | null>(
  localStorage,
  "selectedGroupId",
  type("number"),
)
const selectedId = signal<number | null>(selectedIdStorage.get() ?? null)
effect(() => selectedIdStorage.set(selectedId.value))

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

export const group = {
  list,
  selectedId,
  ops,
  init() {
    // Listen for group list updates from the server
    ws.onMessage((msg) => {
      if (msg.e !== "group") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          group.list.value = Array.isArray(msg.p) ? (msg.p as Group[]) : []
          if (group.list.value.length > 0 && !group.selectedId.value) {
            group.selectedId.value = group.list.value[0].id
          } else if (group.list.value.length === 0) {
            group.selectedId.value = null
          }
          break
        case WebSocketMessageType.CREATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            const newGroup = p[0] as Group
            group.list.value = [...group.list.value, newGroup]
            // Auto-select the newly created group
            group.selectedId.value = newGroup.id
          }
          group.ops.create.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.UPDATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            group.list.value = group.list.value.map((g) =>
              g.id === (p[0] as Group).id ? p[0] as Group : g
            )
          }
          group.ops.update.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.DELETED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            const deletedGroup = p[0] as Group
            // Update the item in place (soft delete) instead of removing from list
            group.list.value = group.list.value.map((g) =>
              g.id === deletedGroup.id ? deletedGroup : g
            )
            // If the deleted group was selected, it stays selected but marked as deleted
          }
          group.ops.delete.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.ERROR_VALIDATION: {
          const errorMsg = Array.isArray(msg.p) && typeof msg.p[0] === "string"
            ? msg.p[0]
            : "Validation error"
          if (group.ops.create.value.inProgress) {
            group.ops.create.value = { inProgress: false, error: errorMsg }
          }
          if (group.ops.update.value.inProgress) {
            group.ops.update.value = { inProgress: false, error: errorMsg }
          }
          if (group.ops.delete.value.inProgress) {
            group.ops.delete.value = { inProgress: false, error: errorMsg }
          }
          toast.error({ body: errorMsg })
          break
        }
      }
    })
  },
  create(name: string, currencyId: number) {
    group.ops.create.value = { inProgress: true, error: null }
    ws.request({
      message: { e: "group", t: WebSocketMessageType.CREATE, p: [{ name, currencyId }] },
    })
  },
  update(id: number, name: string, currencyId: number) {
    group.ops.update.value = { inProgress: true, error: null }
    ws.request({
      message: { e: "group", t: WebSocketMessageType.UPDATE, p: [{ id, name, currencyId }] },
    })
  },
  remove(id: number) {
    group.ops.delete.value = { inProgress: true, error: null }
    ws.request({ message: { e: "group", t: WebSocketMessageType.DELETE, p: [{ id }] } })
  },
  undelete(id: number) {
    group.ops.update.value = { inProgress: true, error: null }
    ws.request({ message: { e: "group", t: WebSocketMessageType.UNDELETE, p: [{ id }] } })
  },
  /**
   * Get the currency display info for the currently selected group
   */
  getSelectedCurrency() {
    const selectedGroup = group.list.value.find((g) => g.id === group.selectedId.value)
    return selectedGroup ? currency.getDisplay(selectedGroup.currencyId) : currency.getByCode("USD")
  },
}
