import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Group } from "@shared/types"
import { toast } from "./toast.ts"

// Holds the list of groups for the current user
const list = signal<Group[]>([])

// Holds the currently selected groupId (default: first group)
const selectedId = signal<number | null>(null)

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
        case "list":
          group.list.value = Array.isArray(msg.p) ? (msg.p as Group[]) : []
          if (group.list.value.length > 0 && !group.selectedId.value) {
            group.selectedId.value = group.list.value[0].id
          } else if (group.list.value.length === 0) {
            group.selectedId.value = null
          }
          break
        case "created": {
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
        case "updated": {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            group.list.value = group.list.value.map((g) =>
              g.id === (p[0] as Group).id ? p[0] as Group : g
            )
          }
          group.ops.update.value = { inProgress: false, error: null }
          break
        }
        case "deleted": {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            const deletedGroup = p[0] as Group
            group.list.value = group.list.value.filter((g) => g.id !== deletedGroup.id)
            // If the deleted group was selected, select another one
            if (group.selectedId.value === deletedGroup.id) {
              group.selectedId.value = group.list.value.length > 0 ? group.list.value[0].id : null
            }
          }
          group.ops.delete.value = { inProgress: false, error: null }
          break
        }
        case "error_validation": {
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
  create(name: string, defaultCurrency: string = "USD") {
    group.ops.create.value = { inProgress: true, error: null }
    ws.request({
      message: { e: "group", t: "create", p: [{ name, defaultCurrency }] },
    })
  },
  update(id: number, name: string, defaultCurrency: string) {
    group.ops.update.value = { inProgress: true, error: null }
    ws.request({
      message: { e: "group", t: "update", p: [{ id, name, defaultCurrency }] },
    })
  },
  remove(id: number) {
    group.ops.delete.value = { inProgress: true, error: null }
    ws.request({ message: { e: "group", t: "delete", p: [{ id }] } })
  },
}
