import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { IconArrowRight } from "@spy4x/preact-icons"
import { ADMIN_TRANSFERS_PATH, AdminTransfersScreen } from "@ui/admin-transfers-screen.tsx"
import type { AdminContext, AdminModule } from "../types.ts"
import { createTransfersState, type TransfersModuleState } from "./state.ts"

/** One Transfers state per signed-in session, so a return to the page shows the last counts. */
const states = new WeakMap<AdminContext, TransfersModuleState>()

function transfersState(context: AdminContext): TransfersModuleState {
  let state = states.get(context)
  if (!state) {
    state = createTransfersState(context.request)
    states.set(context, state)
  }
  return state
}

function TransfersView({ context }: { context: AdminContext }): JSX.Element {
  const state = transfersState(context)
  useEffect(() => {
    state.load()
  }, [state])
  const { overview, error } = state.transfers.value
  return (
    <AdminTransfersScreen
      overview={overview}
      error={error}
      onRetry={() => state.load()}
      navigate={context.navigate}
    />
  )
}

/** How households move money between their accounts: counts only, never an amount or memo. */
export const transfersModule: AdminModule = {
  id: `transfers`,
  nav: { name: `AdminNav.transfers`, href: ADMIN_TRANSFERS_PATH, Icon: IconArrowRight },
  routes: [{ path: ADMIN_TRANSFERS_PATH, View: TransfersView }],
}
