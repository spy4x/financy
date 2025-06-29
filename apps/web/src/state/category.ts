import { computed, signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Category, CategoryType, WebSocketMessageType } from "@shared/types"
import { group } from "./group.ts"
import { toast } from "./toast.ts"
import { transaction } from "./transaction.ts"

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

/**
 * Computed monthly spent amounts for all categories in the current month.
 * Returns a Map of categoryId -> spent amount in cents.
 * Only counts DEBIT transactions (money going out) as "spent".
 */
const monthlySpent = computed(() => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const selectedGroupId = group.selectedId.value
  if (!selectedGroupId) return new Map<number, number>()

  const spentByCategory = new Map<number, number>()

  transaction.list.value.forEach((txn) => {
    // Filter by group and current month
    if (txn.groupId !== selectedGroupId) return

    const txnDate = new Date(txn.createdAt)
    if (txnDate < startOfMonth || txnDate > endOfMonth) return

    // Only count debit transactions (money going out) as "spent"
    if (txn.type !== 1) return // 1 = DEBIT (money out)

    if (txn.categoryId) {
      const currentSpent = spentByCategory.get(txn.categoryId) || 0
      spentByCategory.set(txn.categoryId, currentSpent + txn.amount)
    }
  })

  return spentByCategory
})

export const category = {
  list,
  ops,
  monthlySpent,
  /**
   * Get the monthly spent amount for a specific category
   */
  getMonthlySpent(categoryId: number): number {
    return category.monthlySpent.value.get(categoryId) || 0
  },
  init() {
    ws.onMessage((msg) => {
      if (msg.e !== "category") return
      switch (msg.t) {
        case WebSocketMessageType.LIST:
          category.list.value = Array.isArray(msg.p) ? (msg.p as Category[]) : []
          break
        case WebSocketMessageType.CREATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const newCategories = p.filter((item): item is Category => !!item)
          if (newCategories.length > 0) {
            category.list.value = [...category.list.value, ...newCategories]
          }
          category.ops.create.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.UPDATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const updatedCategories = p.filter((item): item is Category => !!item)
          if (updatedCategories.length > 0) {
            category.list.value = category.list.value.map((c) => {
              const updated = updatedCategories.find((u) => u.id === c.id)
              return updated ? updated : c
            })
          }
          category.ops.update.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.DELETED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const deletedCategories = p.filter((item): item is Category => !!item)
          if (deletedCategories.length > 0) {
            // Update the items in place (soft delete) instead of removing from list
            category.list.value = category.list.value.map((c) => {
              const deleted = deletedCategories.find((d) => d.id === c.id)
              return deleted ? deleted : c
            })
          }
          category.ops.delete.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.ERROR_VALIDATION: {
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
  create(
    name: string,
    type: CategoryType = CategoryType.EXPENSE,
    monthlyLimit?: number | null,
    icon?: string | null,
    color?: string | null,
  ) {
    const groupId = group.selectedId.value
    if (!groupId) {
      toast.error({ body: "Please select a group first." })
      return
    }
    category.ops.create.value = { inProgress: true, error: null }

    // Build payload conditionally to avoid sending null monthlyLimit for income categories
    const payload = {
      name,
      groupId,
      type,
      ...(type === CategoryType.EXPENSE && monthlyLimit !== undefined && monthlyLimit !== null &&
        { monthlyLimit }),
      ...(icon && { icon }),
      ...(color && { color }),
    }

    ws.request({
      message: {
        e: "category",
        t: WebSocketMessageType.CREATE,
        p: [payload],
      },
    })
  },
  update(
    id: number,
    name: string,
    type: CategoryType,
    monthlyLimit?: number | null,
    icon?: string | null,
    color?: string | null,
  ) {
    const groupId = group.selectedId.value
    if (!groupId) {
      toast.error({ body: "Please select a group first." })
      return
    }
    category.ops.update.value = { inProgress: true, error: null }

    // Build payload conditionally to avoid sending null monthlyLimit for income categories
    const payload = {
      id,
      name,
      groupId,
      type,
      ...(type === CategoryType.EXPENSE && monthlyLimit !== undefined && monthlyLimit !== null &&
        { monthlyLimit }),
      ...(icon && { icon }),
      ...(color && { color }),
    }

    ws.request({
      message: {
        e: "category",
        t: WebSocketMessageType.UPDATE,
        p: [payload],
      },
    })
  },
  remove(id: number) {
    category.ops.delete.value = { inProgress: true, error: null }
    ws.request({ message: { e: "category", t: WebSocketMessageType.DELETE, p: [{ id }] } })
  },
  undelete(id: number) {
    category.ops.update.value = { inProgress: true, error: null }
    ws.request({ message: { e: "category", t: WebSocketMessageType.UNDELETE, p: [{ id }] } })
  },
}
