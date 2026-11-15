import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { IconTarget } from "@spy4x/preact-icons"
import { ADMIN_BUDGETS_PATH, AdminBudgetsScreen } from "@ui/admin-budgets-screen.tsx"
import type { AdminContext, AdminModule } from "../types.ts"
import { type BudgetsModuleState, createBudgetsState } from "./state.ts"

/** One Budgets state per signed-in session, so a return to the page shows the last counts. */
const states = new WeakMap<AdminContext, BudgetsModuleState>()

function budgetsState(context: AdminContext): BudgetsModuleState {
  let state = states.get(context)
  if (!state) {
    state = createBudgetsState(context.request)
    states.set(context, state)
  }
  return state
}

function BudgetsView({ context }: { context: AdminContext }): JSX.Element {
  const state = budgetsState(context)
  useEffect(() => {
    state.load()
  }, [state])
  const { overview, error } = state.budgets.value
  return (
    <AdminBudgetsScreen
      overview={overview}
      error={error}
      onRetry={() => state.load()}
      navigate={context.navigate}
    />
  )
}

/** How households budget this month: counts and methods only, never an amount or a category. */
export const budgetsModule: AdminModule = {
  id: `budgets`,
  nav: { name: `AdminNav.budgets`, href: ADMIN_BUDGETS_PATH, Icon: IconTarget },
  routes: [{ path: ADMIN_BUDGETS_PATH, View: BudgetsView }],
}
