import { signal } from "@preact/signals"
import type { AdminCategoriesOverview } from "@domain/categories"
import type { AdminFetch } from "../../state.ts"

/** What the Categories page shows: the last answer, or why it failed. */
export interface CategoriesState {
  overview: AdminCategoriesOverview | null
  error: string | null
}

/** The Categories module's state. A failed read keeps the last counts on screen. */
export function createCategoriesState(request: AdminFetch) {
  const categories = signal<CategoriesState>({ overview: null, error: null })
  return {
    categories,
    async load(): Promise<void> {
      categories.value = { ...categories.value, error: null }
      const result = await request<AdminCategoriesOverview>(`/api/admin/categories`)
      categories.value = result.ok
        ? { overview: result.data, error: null }
        : { ...categories.value, error: result.error.message }
    },
  }
}

export type CategoriesModuleState = ReturnType<typeof createCategoriesState>
