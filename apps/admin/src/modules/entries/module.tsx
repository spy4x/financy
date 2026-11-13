import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { IconList } from "@spy4x/preact-icons"
import { ADMIN_ENTRIES_PATH, AdminEntriesScreen } from "@ui/admin-entries-screen.tsx"
import type { AdminContext, AdminModule } from "../types.ts"
import { createEntriesState, type EntriesModuleState } from "./state.ts"

/** One Entries state per signed-in session, so a return to the page shows the last counts. */
const states = new WeakMap<AdminContext, EntriesModuleState>()

function entriesState(context: AdminContext): EntriesModuleState {
  let state = states.get(context)
  if (!state) {
    state = createEntriesState(context.request)
    states.set(context, state)
  }
  return state
}

function EntriesView({ context }: { context: AdminContext }): JSX.Element {
  const state = entriesState(context)
  useEffect(() => {
    state.load()
  }, [state])
  const { overview, error } = state.entries.value
  return (
    <AdminEntriesScreen
      overview={overview}
      error={error}
      onRetry={() => state.load()}
      navigate={context.navigate}
    />
  )
}

/** How households use the ledger: entries per month and per household, never an amount or memo. */
export const entriesModule: AdminModule = {
  id: `entries`,
  nav: { name: `AdminNav.entries`, href: ADMIN_ENTRIES_PATH, Icon: IconList },
  routes: [{ path: ADMIN_ENTRIES_PATH, View: EntriesView }],
}
