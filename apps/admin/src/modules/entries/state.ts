import { signal } from "@preact/signals"
import type { AdminEntriesOverview } from "@domain/transactions"
import type { AdminFetch } from "../../state.ts"

/** What the Entries page shows: the last answer, or why it failed. */
export interface EntriesState {
  overview: AdminEntriesOverview | null
  error: string | null
}

/** The Entries module's state. A failed read keeps the last counts on screen. */
export function createEntriesState(request: AdminFetch) {
  const entries = signal<EntriesState>({ overview: null, error: null })
  return {
    entries,
    async load(): Promise<void> {
      entries.value = { ...entries.value, error: null }
      const result = await request<AdminEntriesOverview>(`/api/admin/entries`)
      entries.value = result.ok
        ? { overview: result.data, error: null }
        : { ...entries.value, error: result.error.message }
    },
  }
}

export type EntriesModuleState = ReturnType<typeof createEntriesState>
