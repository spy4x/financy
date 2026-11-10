import type { ComponentChildren, JSX } from "preact"
import { Button } from "@spy4x/preact-ui/button"
import { Card, CardBody, CardHeader } from "@spy4x/preact-ui/card"
import { DataTable, type DataTableColumn } from "@spy4x/preact-ui/data-table"
import { EmptyState } from "@spy4x/preact-ui/empty-state"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { FactList } from "@spy4x/preact-ui/fact-list"
import { Stack } from "@spy4x/preact-ui/layout"
import { Link } from "@spy4x/preact-ui/link"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { UsageMeter } from "@spy4x/preact-ui/usage-meter"
import { useFormat } from "@spy4x/preact-ui/format"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { type AdminRatesSnapshot, RATE_SOURCES } from "@domain/money"
import { ADMIN_JOB_PATHS } from "./admin-jobs-screen.tsx"
import type { Navigate } from "./progressive.tsx"
import { useAdminText } from "./i18n.ts"

export interface AdminRatesScreenProps {
  /** The last reading, or `null` before the first arrives. */
  snapshot: AdminRatesSnapshot | null
  /** Why the page could not be read, or `null`. */
  error: string | null
  /** A reading is in flight. */
  pending: boolean
  onRetry: () => void
  navigate?: Navigate
}

/** One line of the table: a source's fetch on a day, or a day with none. */
interface DayRow {
  key: string
  date: string
  source: string | null
  currencies: number
  fetchedAt: string | null
}

/** A source as the operator reads it: the ECB through Frankfurter, or the paid fallback. */
function sourceName(t: Translator<string>, source: string): string {
  if (source === RATE_SOURCES.ecb) return t.t(`AdminRates.sourceEcb`)
  return t.t(`AdminRates.sourceFallback`, {
    provider: source === RATE_SOURCES.fallback ? `ExchangeRate-API` : source,
  })
}

/** The page's dates, all in UTC as the daily job counts them, in the person's region format. */
interface RateDates {
  /** `Nov 6, 4:02 PM UTC`: a fetch time. */
  at: (iso: string) => string
  /** `Friday, November 6, 2026`: a rate day (`YYYY-MM-DD`), a calendar date, not a moment. */
  day: (date: string) => string
  /** `November 6, 2026`: a date in a sentence. */
  long: (date: string) => string
}

function useRateDates(): RateDates {
  const utc = useFormat().utc()
  const t = useAdminText()
  return {
    at: (iso) => t.t(`AdminJobs.atClock`, { day: utc.dayMonth(iso), time: utc.time(iso) }),
    day: (date) => utc.date(`${date}T00:00:00Z`, `full`),
    long: (date) => utc.date(`${date}T00:00:00Z`, `long`),
  }
}

/**
 * The Exchange rates page: the last fetch of each source, the main currencies in use with no rate
 * for the latest rate day, the paid fallback's calls this month, and the last 7 days. It names no
 * household and counts none. A failed last run is a danger notice that links to the failed jobs.
 */
export function AdminRatesScreen(props: AdminRatesScreenProps): JSX.Element {
  const { snapshot, error } = props
  const t = useAdminText()
  return (
    <Stack>
      <PageHeader
        title={t.t(`AdminRates.title`)}
        subtitle={t.t(`AdminRates.subtitle`)}
        titleDataE2E="admin-rates-title"
        action={
          <Link
            href={ADMIN_JOB_PATHS.list}
            navigate={props.navigate}
            class="pc-link inline-flex min-h-11 items-center text-sm font-medium sm:min-h-9"
            data-e2e="admin-rates-jobs"
          >
            {t.t(`AdminSystem.openJobs`)}
          </Link>
        }
      />
      {snapshot === null
        ? error
          ? (
            <div class="flex flex-col items-start gap-3">
              <ErrorState message={error} dataE2E="admin-rates-error" />
              <Button variant="secondary" onClick={props.onRetry}>
                {t.t(`AdminSystem.retry`)}
              </Button>
            </div>
          )
          : (
            <div
              role="status"
              aria-label={t.t(`AdminRates.loading`)}
              data-e2e="admin-rates-loading"
            >
              <LoadingSkeleton rows={6} />
            </div>
          )
        : (
          <>
            <ErrorState message={error} dataE2E="admin-rates-error" />
            <RatesBody snapshot={snapshot} navigate={props.navigate} />
          </>
        )}
    </Stack>
  )
}

function RatesBody(
  { snapshot, navigate }: { snapshot: AdminRatesSnapshot; navigate?: Navigate },
): JSX.Element {
  const t = useAdminText()
  const dates = useRateDates()
  const { lastRun, fetches, missing, fallback } = snapshot
  const failed = lastRun?.failed
    ? (
      <div data-e2e="admin-rates-failed">
        <Notice tone="danger">
          <span class="flex flex-col items-start gap-1">
            <span>{t.t(`AdminRates.jobFailed`, { time: dates.at(lastRun.at) })}</span>
            <Link
              href={ADMIN_JOB_PATHS.failed}
              navigate={navigate}
              class="pc-link inline-flex min-h-11 items-center text-sm font-medium sm:min-h-9"
              data-e2e="admin-rates-failed-jobs"
            >
              {t.t(`AdminSystem.openJobs`)}
            </Link>
          </span>
        </Notice>
      </div>
    )
    : null
  if (fetches.length === 0) {
    return (
      <>
        {failed}
        <EmptyState
          title={t.t(`AdminRates.emptyTitle`)}
          description={t.t(`AdminRates.emptyText`)}
          headingLevel={2}
        />
      </>
    )
  }
  return (
    <>
      {failed}
      <section
        aria-label={t.t(`AdminRates.title`)}
        class="grid gap-4 lg:grid-cols-3"
        data-e2e="admin-rates-facts"
      >
        <FactCard title={t.t(`AdminRates.lastFetch`)} dataE2E="admin-rates-last-fetch">
          <FactList
            // A third of the page is too narrow for a label beside its value: stacked there too.
            class="-my-3 lg:[&>div]:grid-cols-1 lg:[&_dd]:col-span-1"
            facts={fetches.map((last) => ({
              label: sourceName(t, last.source),
              value: (
                <span class="tabular-nums">
                  {t.t(`AdminRates.fetch`, {
                    time: dates.at(last.fetchedAt),
                    count: last.count,
                  })}
                </span>
              ),
            }))}
          />
        </FactCard>
        <FactCard title={t.t(`AdminRates.missingTitle`)} dataE2E="admin-rates-missing">
          {missing.currencies.length === 0
            ? (
              <p class="text-sm text-muted">
                {t.t(`AdminRates.missingNone`, { date: dates.long(missing.date) })}
              </p>
            )
            : (
              <Notice tone="warning">
                <span class="flex flex-col gap-1">
                  <span class="font-medium tabular-nums" translate={false}>
                    {missing.currencies.join(`, `)}
                  </span>
                  <span>{t.t(`AdminRates.missingText`, { date: dates.long(missing.date) })}</span>
                </span>
              </Notice>
            )}
        </FactCard>
        <FactCard title={t.t(`AdminRates.fallbackTitle`)} dataE2E="admin-rates-fallback">
          {fallback === null
            ? (
              <Notice tone="info" title={t.t(`AdminRates.fallbackOffTitle`)}>
                {t.t(`AdminRates.fallbackOffText`)}
              </Notice>
            )
            : (
              <>
                <UsageMeter
                  used={fallback.used}
                  limit={fallback.cap}
                  label={t.t(`AdminRates.fallbackCalls`)}
                  format={(amount) => new Intl.NumberFormat(t.language).format(amount)}
                />
                {fallback.used >= fallback.cap
                  ? (
                    <Notice tone="warning">
                      {t.t(`AdminRates.fallbackCapped`, {
                        date: dates.long(fallback.resetsOn),
                      })}
                    </Notice>
                  )
                  : (
                    <p class="text-xs text-muted">
                      {t.t(`AdminRates.fallbackHint`, { date: dates.long(fallback.resetsOn) })}
                    </p>
                  )}
              </>
            )}
        </FactCard>
      </section>
      <RatesByDay snapshot={snapshot} />
    </>
  )
}

/** One of the three facts: a titled card. */
function FactCard(
  { title, dataE2E, children }: { title: string; dataE2E: string; children: ComponentChildren },
): JSX.Element {
  return (
    <Card data-e2e={dataE2E}>
      <CardHeader title={title} headingLevel={2} />
      <CardBody class="flex flex-col gap-3">{children}</CardBody>
    </Card>
  )
}

/**
 * The cells pad 1rem (0.75rem on a phone), and a phone shows only the day's cell, which then
 * carries the source, the count and the time on a line of its own.
 */
const TABLE_CLASS = [
  `[&>div:first-child]:min-h-0`,
  `[&_:is(th,td)]:px-4`,
  `max-sm:[&_:is(th,td)]:px-3`,
  `max-sm:[&_:is(th,td):nth-child(n+2)]:hidden`,
].join(` `)

/** A rate day (`YYYY-MM-DD`, read as UTC) is a Saturday or a Sunday, when the ECB publishes none. */
function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/**
 * The last 7 days, newest first: one row per source that fetched that day. A Saturday or Sunday
 * with none is a muted row (`data-weekend`), since the ECB publishes nothing then. Any other day
 * with none is a warning row (`data-missing`): a run failed or skipped it, or it was an ECB
 * holiday, which the page does not tell apart.
 */
function RatesByDay({ snapshot }: { snapshot: AdminRatesSnapshot }): JSX.Element {
  const t = useAdminText()
  const dates = useRateDates()
  const rows: DayRow[] = snapshot.days.flatMap((day): DayRow[] =>
    day.rows.length === 0
      ? [{ key: day.date, date: day.date, source: null, currencies: 0, fetchedAt: null }]
      : day.rows.map((row) => ({
        key: `${day.date}-${row.source}`,
        date: day.date,
        source: row.source,
        currencies: row.currencies,
        fetchedAt: row.fetchedAt,
      }))
  )
  const muted = (text: string) => <span class="text-sm text-muted">{text}</span>
  /** What a day with no rows says: a weekend is expected, a weekday is worth a look. */
  const none = (date: string) =>
    isWeekend(date)
      ? { text: t.t(`AdminRates.weekend`), class: `text-muted` }
      : { text: t.t(`AdminRates.noFetch`), class: `text-warning` }
  const columns: DataTableColumn<DayRow, never>[] = [
    {
      id: `day`,
      header: t.t(`AdminRates.day`),
      render: (row) => (
        <div
          class="flex min-w-0 flex-col gap-1"
          data-weekend={(row.source === null && isWeekend(row.date)) || undefined}
          data-missing={(row.source === null && !isWeekend(row.date)) || undefined}
        >
          <span class={row.source === null ? `text-sm text-muted` : `text-sm font-medium`}>
            {dates.day(row.date)}
          </span>
          <span
            class={`text-xs sm:hidden ${row.source === null ? none(row.date).class : `text-muted`}`}
          >
            {row.source === null
              ? none(row.date).text
              : `${sourceName(t, row.source)} · ${
                t.t(`AdminRates.fetch`, { time: dates.at(row.fetchedAt!), count: row.currencies })
              }`}
          </span>
        </div>
      ),
    },
    {
      id: `source`,
      header: t.t(`AdminRates.source`),
      render: (row) =>
        row.source === null
          ? <span class={`text-sm ${none(row.date).class}`}>{none(row.date).text}</span>
          : <span class="text-sm">{sourceName(t, row.source)}</span>,
    },
    {
      id: `currencies`,
      header: t.t(`AdminRates.currencies`),
      align: `right`,
      render: (row) =>
        row.source === null
          ? muted(`—`)
          : <span class="text-sm tabular-nums">{row.currencies}</span>,
    },
    {
      id: `fetchedAt`,
      header: t.t(`AdminRates.fetchedAt`),
      render: (row) =>
        row.fetchedAt === null
          ? muted(`—`)
          : <span class="whitespace-nowrap text-sm">{dates.at(row.fetchedAt)}</span>,
    },
  ]
  return (
    <section
      class="flex flex-col gap-3"
      aria-labelledby="admin-rates-days"
      data-e2e="admin-rates-days"
    >
      <h2 id="admin-rates-days" class="text-sm font-semibold text-foreground">
        {t.t(`AdminRates.daysTitle`)}
      </h2>
      <DataTable
        class={TABLE_CLASS}
        columns={columns}
        rows={rows}
        sort={[]}
        onSortChange={() => {}}
        caption={t.t(`AdminRates.daysTitle`)}
        captionHidden
        rowKey={(row) => row.key}
      />
    </section>
  )
}
