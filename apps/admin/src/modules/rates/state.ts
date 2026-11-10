import { signal } from "@preact/signals"
import type { AdminRatesSnapshot } from "@domain/money"
import type { AdminFetch } from "../../state.ts"

export interface RatesReadState {
  snapshot: AdminRatesSnapshot | null
  pending: boolean
  /** Whether the last read failed. The page keeps the last snapshot it had. */
  failed: boolean
}

/**
 * The Exchange rates module's state: the last snapshot of the rates. Every call goes through the
 * app's `request`, which signs the app out on a 401.
 */
export function createRatesState(request: AdminFetch) {
  const read = signal<RatesReadState>({ snapshot: null, pending: false, failed: false })

  return {
    read,

    /** Reads the rates again. The last snapshot stays on screen until the new one arrives. */
    async refresh(): Promise<void> {
      if (read.value.pending) return
      read.value = { ...read.value, pending: true, failed: false }
      const result = await request<AdminRatesSnapshot>(`/api/admin/rates`)
      read.value = result.ok
        ? { snapshot: result.data, pending: false, failed: false }
        : { ...read.value, pending: false, failed: true }
    },
  }
}

export type RatesState = ReturnType<typeof createRatesState>
