import type { JSX } from "preact"
import { IconDollar } from "@spy4x/preact-icons"
import { AdminComingSoon } from "@ui/admin-frame.tsx"
import { useAdminText } from "@ui/i18n.ts"
import type { AdminModule } from "../types.ts"

/** Where the Exchange rates page lives. */
export const ADMIN_RATES_PATH = `/rates`

/**
 * The Exchange rates page, a placeholder until its screen is built: the screen needs
 * `UsageMeter`, which comes with `@spy4x/preact-ui` 14 (the PR body of #93 says why).
 */
function RatesView(): JSX.Element {
  const t = useAdminText()
  return (
    <AdminComingSoon
      title={t.t(`AdminRates.title`)}
      description={t.t(`AdminRates.subtitle`)}
      Icon={IconDollar}
    />
  )
}

/** The Exchange rates module: the daily rates, what has none today, and the paid fallback. */
export const ratesModule: AdminModule = {
  id: `rates`,
  nav: { name: `AdminNav.rates`, href: ADMIN_RATES_PATH, Icon: IconDollar },
  routes: [{ path: ADMIN_RATES_PATH, View: RatesView }],
}
