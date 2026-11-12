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
import type { AdminEntriesOverview } from "@domain/transactions"
import { ADMIN_GROUP_PATHS } from "./admin-groups-list.tsx"
import type { Navigate } from "./progressive.tsx"
import { useAdminText } from "./i18n.ts"

/** The entries module's page in the admin app. */
export const ADMIN_ENTRIES_PATH = `/entries`

export interface AdminEntriesScreenProps {
  /** The counts, or `null` while they load or when they could not be read. */
  overview: AdminEntriesOverview | null
  /** Why the counts could not be read, or `null`. */
  error: string | null
  onRetry: () => void
  navigate?: Navigate
}

/**
 * How households use the ledger: how many entries, per month and per household, and the latest
 * entry day. Counts and dates only: never an amount, a currency or a memo, since they say what a
 * household spends and on what.
 */
export function AdminEntriesScreen(props: AdminEntriesScreenProps): JSX.Element {
  const t = useAdminText()
  const { overview, error } = props
  return (
    <Stack>
      {/* The intro wraps in its own paragraph: the library's subtitle truncates on a phone. */}
      <div class="flex min-w-0 flex-col gap-1">
        <PageHeader title={t.t(`AdminEntries.title`)} titleDataE2E="admin-entries-title" />
        <p dir="auto" class="text-sm text-muted break-words" data-e2e="admin-entries-intro">
          {t.t(`AdminEntries.subtitle`)}
        </p>
      </div>
      {overview === null
        ? error
          ? (
            <div class="flex flex-col items-start gap-3">
              <ErrorState message={error} dataE2E="admin-entries-error" />
              <Button variant="secondary" onClick={props.onRetry}>
                {t.t(`AdminEntries.retry`)}
              </Button>
            </div>
          )
          : (
            <div
              role="status"
              aria-label={t.t(`AdminEntries.loading`)}
              data-e2e="admin-entries-loading"
            >
              <LoadingSkeleton rows={6} />
            </div>
          )
        : overview.entries === 0
        ? (
          <div data-e2e="admin-entries-empty">
            <EmptyState
              title={t.t(`AdminEntries.none`)}
              description={t.t(`AdminEntries.noneHint`)}
              headingLevel={2}
            />
          </div>
        )
        : <Body overview={overview} navigate={props.navigate} />}
    </Stack>
  )
}

/** `2026-11` as midnight UTC on its first day, for `Intl`. */
function monthStart(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`)
}

function Body(
  { overview, navigate }: { overview: AdminEntriesOverview; navigate?: Navigate },
): JSX.Element {
  const t = useAdminText()
  const format = useFormat()
  const utc = format.utc()
  const longMonth = new Intl.DateTimeFormat(format.locale, {
    month: `long`,
    year: `numeric`,
    timeZone: `UTC`,
  })
  const shortMonth = new Intl.DateTimeFormat(format.locale, { month: `short`, timeZone: `UTC` })
  const months = overview.months.map((row) => ({
    ...row,
    long: longMonth.format(monthStart(row.month)),
    short: shortMonth.format(monthStart(row.month)),
  }))
  return (
    <>
      <section aria-label={t.t(`AdminEntries.keyNumbers`)} data-e2e="admin-entries-stats">
        <KpiGrid minWidth="11rem">
          <Kpi
            label={t.t(`AdminEntries.entries`)}
            value={format.number(overview.entries)}
            tone="accent"
          />
          <Kpi
            label={t.t(`AdminEntries.households`)}
            value={format.number(overview.households)}
            sub={t.t(`AdminEntries.householdsHint`)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminEntries.lastEntry`)}
            value={overview.lastEntryDate ? utc.date(overview.lastEntryDate) : `-`}
            sub={t.t(`AdminEntries.lastEntryHint`)}
            tone="neutral"
          />
        </KpiGrid>
      </section>
      <div class="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card data-e2e="admin-entries-months">
          <CardHeader title={t.t(`AdminEntries.byMonth`)} headingLevel={2} />
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
                      {t.t(`AdminEntries.entryCount`, { count: row.entries })}
                    </span>
                    <span class="text-xs text-muted">
                      {t.t(`AdminEntries.householdCount`, { count: row.households })}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card data-e2e="admin-entries-households">
          <CardHeader title={t.t(`AdminEntries.topHouseholds`)} headingLevel={2} />
          <CardBody>
            <ul class="flex flex-col divide-y divide-subtle">
              {overview.topHouseholds.map((household) => (
                <li key={household.groupId} class="flex flex-col gap-2 py-3">
                  <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={ADMIN_GROUP_PATHS.group(household.groupId)}
                      navigate={navigate}
                      class="inline-flex min-h-11 min-w-0 items-center truncate font-medium sm:min-h-9"
                    >
                      <bdi>{household.groupName}</bdi>
                    </Link>
                    <span class="ms-auto text-sm tabular-nums">
                      {t.t(`AdminEntries.entryCount`, { count: household.entries })}
                    </span>
                  </div>
                  <ol
                    class="grid grid-cols-6 gap-1"
                    aria-label={t.t(`AdminEntries.perMonth`)}
                  >
                    {household.months.map((count, index) => (
                      <li
                        key={months[index].month}
                        class={`flex flex-col items-center rounded-md py-1 ${
                          count ? `bg-selected-soft` : `bg-track`
                        }`}
                      >
                        <span aria-hidden="true" class="text-xs text-muted">
                          {months[index].short}
                        </span>
                        <span
                          aria-hidden="true"
                          class={`text-sm tabular-nums ${count ? `font-medium` : `text-muted`}`}
                        >
                          {format.number(count)}
                        </span>
                        <span class="sr-only">
                          {t.t(`AdminEntries.monthCount`, {
                            month: months[index].long,
                            count,
                          })}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p class="text-xs text-muted">
                    {t.t(`AdminEntries.householdLastEntry`, {
                      date: utc.date(household.lastEntryDate),
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
