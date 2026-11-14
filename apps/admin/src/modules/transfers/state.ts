import { signal } from "@preact/signals"
import type { AdminTransfersOverview } from "@domain/transfers"
import type { AdminFetch } from "../../state.ts"

/** What the Transfers page shows: the last answer, or why it failed. */
export interface TransfersState {
  overview: AdminTransfersOverview | null
  error: string | null
}

/** The Transfers module's state. A failed read keeps the last counts on screen. */
export function createTransfersState(request: AdminFetch) {
  const transfers = signal<TransfersState>({ overview: null, error: null })
  return {
    transfers,
    async load(): Promise<void> {
      transfers.value = { ...transfers.value, error: null }
      const result = await request<AdminTransfersOverview>(`/api/admin/transfers`)
      transfers.value = result.ok
        ? { overview: result.data, error: null }
        : { ...transfers.value, error: result.error.message }
    },
  }
}

export type TransfersModuleState = ReturnType<typeof createTransfersState>
