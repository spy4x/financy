import type { JSX } from "preact"
import { Card } from "@spy4x/preact-ui/card"
import { useFormat } from "@spy4x/preact-ui/format"
import { formatMoney } from "@spy4x/platform/universal/money"
import type { HouseholdTotal } from "@domain/accounts"
import { useAppText } from "./i18n.ts"

export interface AccountsTotalProps {
  /** The server's total; `null` while it is read. */
  total: HouseholdTotal | null
}

const HEADING = `accounts-total-heading`

/**
 * The household's total at the top of `/accounts`: every account converted to the base currency.
 * It reads "about" with the oldest rate date when any account needed a rate, and is exact without
 * one. A currency with no rate is left out and named. A negative total keeps the surrounding
 * colour: a household with a mortgage is not in error. The amount is one text node, so a screen
 * reader says it whole. While it loads, a bar holds the card's height so the list does not jump.
 */
export function AccountsTotal({ total }: AccountsTotalProps): JSX.Element {
  const t = useAppText()
  return (
    <section aria-labelledby={HEADING} class="flex flex-col gap-2" data-e2e="accounts-total">
      <h2 id={HEADING} class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {t.t(`AccountsTotal.title`)}
      </h2>
      <Card class="flex min-h-24 flex-col justify-center gap-1 px-4 py-4 sm:px-6">
        {total === null
          ? (
            <div
              class="h-9 w-48 animate-pulse rounded bg-track motion-reduce:animate-none"
              aria-hidden="true"
            />
          )
          : <TotalText total={total} />}
      </Card>
    </section>
  )
}

/** The amount, the rate date and what was left out, in the person's region format. */
function TotalText({ total }: { total: HouseholdTotal }): JSX.Element {
  const t = useAppText()
  const format = useFormat()
  const amount = total.amount === null
    ? null
    : formatMoney(total.amount, total.currency, format.locale)
  const leftOut = total.leftOut.reduce((sum, item) => sum + item.accounts, 0)
  return (
    <>
      {amount !== null && (
        <p
          class="text-2xl font-semibold tabular-nums sm:text-3xl"
          data-e2e="accounts-total-amount"
        >
          {total.rateDate === null ? amount : t.t(`AccountsTotal.about`, { amount })}
        </p>
      )}
      {amount !== null && total.rateDate !== null && (
        <p class="text-sm text-muted" data-e2e="accounts-total-rates">
          {t.t(`AccountsTotal.rates`, { date: format.utc().date(total.rateDate) })}
        </p>
      )}
      {total.tooLarge && (
        <p class="text-sm text-muted" data-e2e="accounts-total-too-large">
          {t.t(`AccountsTotal.tooLarge`)}
        </p>
      )}
      {leftOut > 0 && (
        <p class="text-sm text-muted" data-e2e="accounts-total-left-out">
          {t.t(`AccountsTotal.leftOut`, {
            count: leftOut,
            currencies: new Intl.ListFormat(t.language, { type: `conjunction` })
              .format(total.leftOut.map((item) => item.currency)),
          })}
        </p>
      )}
    </>
  )
}
