import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Category } from "@shared/types"
import { group } from "./group.ts"
import { toast } from "./toast.ts"

const list = signal<Category[]>([])
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

export const category = {
  list,
  ops,
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "category") return
      switch (msg.t) {
        case "list":
          category.list.value = Array.isArray(msg.p) ? (msg.p as Category[]) : []
          break
        case "created": {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) category.list.value = [...category.list.value, p[0] as Category]
          category.ops.create.value = { inProgress: false, error: null }
          break
        }
        case "updated": {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            category.list.value = category.list.value.map((c) =>
              c.id === (p[0] as Category).id ? p[0] as Category : c
            )
          }
          category.ops.update.value = { inProgress: false, error: null }
          break
        }
        case "deleted": {
          const p = Array.isArray(msg.p) ? msg.p : []
          if (p[0]) {
            category.list.value = category.list.value.filter((c) => c.id !== (p[0] as Category).id)
          }
          category.ops.delete.value = { inProgress: false, error: null }
          break
        }
        case "error_validation": {
          const errorMsg = Array.isArray(msg.p) && typeof msg.p[0] === "string"
            ? msg.p[0]
            : "Validation error"
          if (category.ops.create.value.inProgress) {
            category.ops.create.value = { inProgress: false, error: errorMsg }
          }
          if (category.ops.update.value.inProgress) {
            category.ops.update.value = { inProgress: false, error: errorMsg }
          }
          if (category.ops.delete.value.inProgress) {
            category.ops.delete.value = { inProgress: false, error: errorMsg }
          }
          toast.error({ body: errorMsg })
          break
        }
      }
    })
  },
  create(name: string) {
    const groupId = group.selectedId.value
    if (!groupId) {
      toast.error({ body: "Please select a group first." })
      return
    }
    category.ops.create.value = { inProgress: true, error: null }
    ws.request({
      message: { e: "category", t: "create", p: [{ name, groupId }] },
    })
  },
  update(id: number, name: string) {
    const groupId = group.selectedId.value
    if (!groupId) {
      toast.error({ body: "Please select a group first." })
      return
    }
    category.ops.update.value = { inProgress: true, error: null }
    ws.request({
      message: { e: "category", t: "update", p: [{ id, name, groupId }] },
    })
  },
  remove(id: number) {
    category.ops.delete.value = { inProgress: true, error: null }
    ws.request({ message: { e: "category", t: "delete", p: [{ id }] } })
  },
}
