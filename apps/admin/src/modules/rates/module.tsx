import type { JSX } from "preact"
import { useEffect } from "preact/hooks"
import { IconDollar } from "@spy4x/preact-icons"
import { AdminRatesScreen } from "@ui/admin-rates-screen.tsx"
import { useAdminText } from "@ui/i18n.ts"
import type { AdminContext, AdminModule } from "../types.ts"
import { createRatesState, type RatesState } from "./state.ts"

/** Where the Exchange rates page lives. */
export const ADMIN_RATES_PATH = `/rates`

/** One rates state per signed-in session. */
const states = new WeakMap<AdminContext, RatesState>()

function ratesState(context: AdminContext): RatesState {
  let state = states.get(context)
  if (!state) {
    state = createRatesState(context.request)
    states.set(context, state)
  }
  return state
}

/** The Exchange rates page, read each time it opens and on "Try again". */
function RatesView({ context }: { context: AdminContext }): JSX.Element {
  const t = useAdminText()
  const state = ratesState(context)
  useEffect(() => {
    state.refresh()
  }, [state])
  const read = state.read.value
  return (
    <AdminRatesScreen
      snapshot={read.snapshot}
      error={read.failed ? t.t(`AdminRates.loadError`) : null}
      pending={read.pending}
      onRetry={() => state.refresh()}
      navigate={context.navigate}
    />
  )
}

/** The Exchange rates module: the daily rates, what has none today, and the paid fallback. */
export const ratesModule: AdminModule = {
  id: `rates`,
  nav: { name: `AdminNav.rates`, href: ADMIN_RATES_PATH, Icon: IconDollar },
  routes: [{ path: ADMIN_RATES_PATH, View: RatesView }],
}
