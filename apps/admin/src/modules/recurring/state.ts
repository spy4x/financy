import { signal } from "@preact/signals"
import type { AdminRecurringOverview } from "@domain/recurring"
import type { AdminFetch } from "../../state.ts"

/** What the Repeating entries page shows: the last answer, or why it failed. */
export interface RecurringState {
  overview: AdminRecurringOverview | null
  error: string | null
}

/** The Repeating entries module's state. A failed read keeps the last counts on screen. */
export function createRecurringState(request: AdminFetch) {
  const recurring = signal<RecurringState>({ overview: null, error: null })
  return {
    recurring,
    async load(): Promise<void> {
      recurring.value = { ...recurring.value, error: null }
      const result = await request<AdminRecurringOverview>(`/api/admin/recurring`)
      recurring.value = result.ok
        ? { overview: result.data, error: null }
        : { ...recurring.value, error: result.error.message }
    },
  }
}

export type RecurringModuleState = ReturnType<typeof createRecurringState>
