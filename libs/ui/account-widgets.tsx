import type { JSX } from "preact"
import { Link } from "@spy4x/preact-ui/link"
import { ACCOUNT_KINDS, ACCOUNT_WIDGET_IDS, type AccountWidgetResult } from "@domain/accounts"
import { TotalText } from "./accounts-total.tsx"
import type { WidgetDrawContext, WidgetView } from "./note-widgets.tsx"
import { ACCOUNT_PATHS, LINKED_GROUP_PARAM } from "./progressive.tsx"
import { moneyText } from "./transfer-parts.tsx"
import { useAppText } from "./i18n.ts"

/**
 * "How much do we have?" on the household overview: the household total as the Accounts screen
 * words it ({@link TotalText}), then each live account's balance in its own currency, in the
 * screen's kind order, then a link to the Accounts screen. The figures are the server's one read
 * (`AccountWidgetResult`), never a sum made here. Balances are in the plain foreground colour: a
 * negative one, a card or a loan, is not an error.
 */

/** The Accounts screen of household `groupId`, else the selected one. */
export function accountsLinkHref(groupId?: string): string {
  if (!groupId) return ACCOUNT_PATHS.list
  return `${ACCOUNT_PATHS.list}?${new URLSearchParams({ [LINKED_GROUP_PARAM]: groupId })}`
}

const LINK_CLASS = `pc-link inline-flex min-h-11 items-center self-start text-sm sm:min-h-9`

/**
 * The card's body. Archived accounts are in the total, as on the Accounts screen, but not listed,
 * since that screen hides them until asked; a muted line says how many the total holds.
 */
export function BalancesBody(
  { result, context }: { result: AccountWidgetResult; context: WidgetDrawContext },
): JSX.Element {
  const t = useAppText()
  const { locale } = context.format
  const live = ACCOUNT_KINDS.flatMap((kind) =>
    result.accounts.filter((account) => !account.archived && account.kind === kind)
  )
  const archived = result.accounts.length - live.length
  const link = (
    <Link
      href={accountsLinkHref(context.groupId)}
      navigate={context.navigate}
      class={LINK_CLASS}
      data-e2e="account-widget-link"
    >
      {t.t(`AccountWidgets.link`)}
    </Link>
  )
  if (result.accounts.length === 0) {
    return (
      <div class="flex min-w-0 flex-col gap-2">
        <p class="text-sm text-muted" data-e2e="account-widget-none">
          {t.t(`AccountWidgets.none`)}
        </p>
        {link}
      </div>
    )
  }
  return (
    <div class="flex min-w-0 flex-col gap-2">
      <div class="flex min-w-0 flex-col gap-1 break-words" data-e2e="account-widget-total">
        <TotalText total={result.total} />
      </div>
      {archived > 0 && (
        <p class="text-sm text-muted" data-e2e="account-widget-archived">
          {t.t(`AccountWidgets.archived`, { count: archived })}
        </p>
      )}
      {live.length > 0 && (
        <ul
          class="flex flex-col divide-y divide-subtle"
          aria-label={t.t(`AccountWidgets.title`)}
          data-e2e="account-widget-rows"
        >
          {live.map((account) => (
            <li
              key={account.id}
              class="flex items-baseline justify-between gap-3 py-2"
              data-e2e="account-widget-row"
            >
              <span class="min-w-0 break-words" data-e2e="account-widget-name">
                <bdi>{account.name}</bdi>
              </span>
              <span
                class="shrink-0 text-end font-medium tabular-nums"
                data-e2e="account-widget-balance"
              >
                <bdi>{moneyText(account.balance, account.currency, locale)}</bdi>
              </span>
            </li>
          ))}
        </ul>
      )}
      {link}
    </div>
  )
}

/** How the overview draws "How much do we have?", by widget id. */
export const ACCOUNT_WIDGET_VIEWS: Readonly<Record<string, WidgetView>> = {
  [ACCOUNT_WIDGET_IDS.balances]: {
    loadingKey: `AccountWidgets.loading`,
    errorKey: `AccountWidgets.error`,
    draw: (data, context) => ({
      status: "ready",
      content: <BalancesBody result={data as AccountWidgetResult} context={context} />,
    }),
  },
}
