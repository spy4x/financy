import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { IconRefresh } from "@spy4x/preact-icons"
import { ADMIN_RECURRING_PATH, AdminRecurringScreen } from "@ui/admin-recurring-screen.tsx"
import type { AdminContext, AdminModule } from "../types.ts"
import { createRecurringState, type RecurringModuleState } from "./state.ts"

/** One Repeating entries state per signed-in session, so a return to the page shows the last counts. */
const states = new WeakMap<AdminContext, RecurringModuleState>()

function recurringState(context: AdminContext): RecurringModuleState {
  let state = states.get(context)
  if (!state) {
    state = createRecurringState(context.request)
    states.set(context, state)
  }
  return state
}

function RecurringView({ context }: { context: AdminContext }): JSX.Element {
  const state = recurringState(context)
  useEffect(() => {
    state.load()
  }, [state])
  const { overview, error } = state.recurring.value
  return (
    <AdminRecurringScreen
      overview={overview}
      error={error}
      onRetry={() => state.load()}
      navigate={context.navigate}
    />
  )
}

/** How households use repeating entries: counts only, never an amount, a memo or a schedule. */
export const recurringModule: AdminModule = {
  id: `recurring`,
  nav: { name: `AdminNav.recurring`, href: ADMIN_RECURRING_PATH, Icon: IconRefresh },
  routes: [{ path: ADMIN_RECURRING_PATH, View: RecurringView }],
}
