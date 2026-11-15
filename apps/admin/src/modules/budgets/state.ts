import { signal } from "@preact/signals"
import type { AdminBudgetsOverview } from "@domain/budgets"
import type { AdminFetch } from "../../state.ts"

/** What the Budgets page shows: the last answer, or why it failed. */
export interface BudgetsState {
  overview: AdminBudgetsOverview | null
  error: string | null
}

/** The Budgets module's state. A failed read keeps the last counts on screen. */
export function createBudgetsState(request: AdminFetch) {
  const budgets = signal<BudgetsState>({ overview: null, error: null })
  return {
    budgets,
    async load(): Promise<void> {
      budgets.value = { ...budgets.value, error: null }
      const result = await request<AdminBudgetsOverview>(`/api/admin/budgets`)
      budgets.value = result.ok
        ? { overview: result.data, error: null }
        : { ...budgets.value, error: result.error.message }
    },
  }
}

export type BudgetsModuleState = ReturnType<typeof createBudgetsState>
