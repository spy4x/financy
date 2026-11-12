import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { IconTag } from "@spy4x/preact-icons"
import { ADMIN_CATEGORIES_PATH, AdminCategoriesScreen } from "@ui/admin-categories-screen.tsx"
import type { AdminContext, AdminModule } from "../types.ts"
import { type CategoriesModuleState, createCategoriesState } from "./state.ts"

/** One Categories state per signed-in session, so a return to the page shows the last counts. */
const states = new WeakMap<AdminContext, CategoriesModuleState>()

function categoriesState(context: AdminContext): CategoriesModuleState {
  let state = states.get(context)
  if (!state) {
    state = createCategoriesState(context.request)
    states.set(context, state)
  }
  return state
}

function CategoriesView({ context }: { context: AdminContext }): JSX.Element {
  const state = categoriesState(context)
  useEffect(() => {
    state.load()
  }, [state])
  const { overview, error } = state.categories.value
  return (
    <AdminCategoriesScreen
      overview={overview}
      error={error}
      onRetry={() => state.load()}
      navigate={context.navigate}
    />
  )
}

/** How households use categories: counts by kind and per household, never a name. */
export const categoriesModule: AdminModule = {
  id: `categories`,
  nav: { name: `AdminNav.categories`, href: ADMIN_CATEGORIES_PATH, Icon: IconTag },
  routes: [{ path: ADMIN_CATEGORIES_PATH, View: CategoriesView }],
}
