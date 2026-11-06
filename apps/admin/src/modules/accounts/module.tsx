import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { IconWallet } from "@spy4x/preact-icons"
import { ADMIN_ACCOUNTS_PATH, AdminAccountsScreen } from "@ui/admin-accounts-screen.tsx"
import type { AdminContext, AdminModule } from "../types.ts"
import { type AccountsModuleState, createAccountsState } from "./state.ts"

/** One Accounts state per signed-in session, so a return to the page shows the last counts. */
const states = new WeakMap<AdminContext, AccountsModuleState>()

function accountsState(context: AdminContext): AccountsModuleState {
  let state = states.get(context)
  if (!state) {
    state = createAccountsState(context.request)
    states.set(context, state)
  }
  return state
}

function AccountsView({ context }: { context: AdminContext }): JSX.Element {
  const state = accountsState(context)
  useEffect(() => {
    state.load()
  }, [state])
  const { overview, error } = state.accounts.value
  return (
    <AdminAccountsScreen
      overview={overview}
      error={error}
      onRetry={() => state.load()}
      navigate={context.navigate}
    />
  )
}

/** How households use accounts: counts by kind and currency, never a name or an amount. */
export const accountsModule: AdminModule = {
  id: `accounts`,
  nav: { name: `AdminNav.accounts`, href: ADMIN_ACCOUNTS_PATH, Icon: IconWallet },
  routes: [{ path: ADMIN_ACCOUNTS_PATH, View: AccountsView }],
}
