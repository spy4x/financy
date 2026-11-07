import { signal } from "@preact/signals"
import type { AdminAccountsOverview } from "@domain/accounts"
import type { AdminFetch } from "../../state.ts"

/** What the Accounts page shows: the last answer, or why it failed. */
export interface AccountsState {
  overview: AdminAccountsOverview | null
  error: string | null
}

/** The Accounts module's state. A failed read keeps the last counts on screen. */
export function createAccountsState(request: AdminFetch) {
  const accounts = signal<AccountsState>({ overview: null, error: null })
  return {
    accounts,
    async load(): Promise<void> {
      accounts.value = { ...accounts.value, error: null }
      const result = await request<AdminAccountsOverview>(`/api/admin/accounts`)
      accounts.value = result.ok
        ? { overview: result.data, error: null }
        : { ...accounts.value, error: result.error.message }
    },
  }
}

export type AccountsModuleState = ReturnType<typeof createAccountsState>
