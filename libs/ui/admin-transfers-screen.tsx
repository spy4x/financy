import type { JSX } from "preact"
import { Kpi, KpiGrid } from "@spy4x/preact-charts/kpi"
import { Button } from "@spy4x/preact-ui/button"
import { Card, CardBody, CardHeader } from "@spy4x/preact-ui/card"
import { EmptyState } from "@spy4x/preact-ui/empty-state"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { useFormat } from "@spy4x/preact-ui/format"
import { Stack } from "@spy4x/preact-ui/layout"
import { Link } from "@spy4x/preact-ui/link"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { periodLabel, periodOf, PeriodUnit } from "@spy4x/time/period"
import type { AdminTransfersOverview } from "@domain/transfers"
import { ADMIN_GROUP_PATHS } from "./admin-groups-list.tsx"
import type { Navigate } from "./progressive.tsx"
import { useAdminText } from "./i18n.ts"

/** The transfers module's page in the admin app. */
export const ADMIN_TRANSFERS_PATH = `/transfers`

export interface AdminTransfersScreenProps {
  /** The counts, or `null` while they load or when they could not be read. */
  overview: AdminTransfersOverview | null
  /** Why the counts could not be read, or `null`. */
  error: string | null
  onRetry: () => void
  navigate?: Navigate
}

/**
 * How households move money between their own accounts: how many transfers, per month and per
 * household, and the latest transfer day. Counts and dates only: never an amount, a currency or a
 * memo, since they say how much a household moves and where.
 */
export function AdminTransfersScreen(props: AdminTransfersScreenProps): JSX.Element {
  const t = useAdminText()
  const { overview, error } = props
  return (
    <Stack>
      {/* The intro wraps in its own paragraph: the library's subtitle truncates on a phone. */}
      <div class="flex min-w-0 flex-col gap-1">
        <PageHeader title={t.t(`AdminTransfers.title`)} titleDataE2E="admin-transfers-title" />
        <p dir="auto" class="text-sm text-muted break-words" data-e2e="admin-transfers-intro">
          {t.t(`AdminTransfers.subtitle`)}
        </p>
      </div>
      {overview === null
        ? error
          ? (
            <div class="flex flex-col items-start gap-3">
              <ErrorState message={error} dataE2E="admin-transfers-error" />
              <Button variant="secondary" class="max-sm:min-h-11" onClick={props.onRetry}>
                {t.t(`AdminTransfers.retry`)}
              </Button>
            </div>
          )
          : (
            <div
              role="status"
              aria-label={t.t(`AdminTransfers.loading`)}
              data-e2e="admin-transfers-loading"
            >
              <LoadingSkeleton rows={6} />
            </div>
          )
        : overview.transfers === 0
        ? (
          <div data-e2e="admin-transfers-empty">
            <EmptyState
              title={t.t(`AdminTransfers.none`)}
              description={t.t(`AdminTransfers.noneHint`)}
              headingLevel={2}
            />
          </div>
        )
        : <Body overview={overview} navigate={props.navigate} />}
    </Stack>
  )
}

function Body(
  { overview, navigate }: { overview: AdminTransfersOverview; navigate?: Navigate },
): JSX.Element {
  const t = useAdminText()
  const format = useFormat()
  const utc = format.utc()
  const months = overview.months.map((row) => ({
    ...row,
    long: periodLabel(periodOf(PeriodUnit.Month, `${row.month}-01`), format.locale),
    short: utc.month(`${row.month}-01`),
  }))
  return (
    <>
      <section aria-label={t.t(`AdminTransfers.keyNumbers`)} data-e2e="admin-transfers-stats">
        <KpiGrid minWidth="11rem">
          <Kpi
            label={t.t(`AdminTransfers.transfers`)}
            value={format.number(overview.transfers)}
            tone="accent"
          />
          <Kpi
            label={t.t(`AdminTransfers.households`)}
            value={format.number(overview.households)}
            sub={t.t(`AdminTransfers.householdsHint`)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminTransfers.lastTransfer`)}
            value={overview.lastTransferDate ? utc.date(overview.lastTransferDate) : `-`}
            sub={t.t(`AdminTransfers.lastTransferHint`)}
            tone="neutral"
          />
        </KpiGrid>
      </section>
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Card data-e2e="admin-transfers-months">
          <CardHeader title={t.t(`AdminTransfers.byMonth`)} headingLevel={2} />
          <CardBody>
            <dl class="flex flex-col divide-y divide-subtle">
              {months.map((row) => (
                <div
                  key={row.month}
                  class="flex min-h-10 flex-wrap items-center justify-between gap-x-3 py-2"
                >
                  <dt class="text-sm">{row.long}</dt>
                  <dd class="flex flex-col items-end text-sm tabular-nums">
                    <span class="font-medium">
                      {t.t(`AdminTransfers.transferCount`, { count: row.transfers })}
                    </span>
                    <span class="text-xs text-muted">
                      {t.t(`AdminTransfers.householdCount`, { count: row.households })}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card data-e2e="admin-transfers-households">
          <CardHeader title={t.t(`AdminTransfers.topHouseholds`)} headingLevel={2} />
          <CardBody>
            <ul class="flex flex-col divide-y divide-subtle">
              {overview.topHouseholds.map((household) => (
                <li key={household.groupId} class="flex flex-col gap-2 py-3">
                  <div class="flex min-w-0 items-center gap-3">
                    <Link
                      href={ADMIN_GROUP_PATHS.group(household.groupId)}
                      navigate={navigate}
                      class="inline-flex min-h-11 min-w-0 items-center font-medium sm:min-h-9"
                    >
                      <bdi class="min-w-0 line-clamp-2 break-words">{household.groupName}</bdi>
                    </Link>
                    <span class="ms-auto shrink-0 text-sm tabular-nums">
                      {t.t(`AdminTransfers.transferCount`, { count: household.transfers })}
                    </span>
                  </div>
                  <ol
                    class="grid grid-cols-6 gap-1"
                    aria-label={t.t(`AdminTransfers.perMonth`)}
                  >
                    {household.months.map((count, index) => (
                      <li
                        key={months[index].month}
                        class={`flex flex-col items-center rounded-md py-1 ${
                          count ? `bg-selected-soft` : `border border-subtle`
                        }`}
                      >
                        <span aria-hidden="true" class={`text-xs ${count ? `` : `text-muted`}`}>
                          {months[index].short}
                        </span>
                        <span
                          aria-hidden="true"
                          class={`text-sm tabular-nums ${count ? `font-medium` : `text-muted`}`}
                        >
                          {format.number(count)}
                        </span>
                        <span class="sr-only">
                          {t.t(`AdminTransfers.monthCount`, {
                            month: months[index].long,
                            count,
                          })}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p class="text-xs text-muted">
                    {t.t(`AdminTransfers.householdLastTransfer`, {
                      date: utc.date(household.lastTransferDate),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
