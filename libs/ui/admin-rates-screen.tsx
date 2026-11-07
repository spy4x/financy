import type { ComponentChildren, JSX } from "preact"
import { IconClock } from "@spy4x/preact-icons"
import { Button } from "@spy4x/preact-ui/button"
import { Card, CardBody, CardHeader } from "@spy4x/preact-ui/card"
import { DataTable, type DataTableColumn } from "@spy4x/preact-ui/data-table"
import { EmptyState } from "@spy4x/preact-ui/empty-state"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { FactList } from "@spy4x/preact-ui/fact-list"
import { Stack } from "@spy4x/preact-ui/layout"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageAction, PageHeader } from "@spy4x/preact-ui/page-header"
import { UsageMeter } from "@spy4x/preact-ui/usage-meter"
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

/** One line of the table: a source's fetch on a day, or a day with none (a weekend, a holiday). */
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

/** `6 Nov, 16:02 UTC`: a fetch time, in UTC as the job runs on it. */
function timeUtc(t: Translator<string>, iso: string): string {
  const time = new Intl.DateTimeFormat(t.language, {
    day: `numeric`,
    month: `short`,
    hour: `2-digit`,
    minute: `2-digit`,
    timeZone: `UTC`,
  }).format(new Date(iso))
  return t.t(`AdminRates.utc`, { time })
}

/** `Fri, 6 Nov`: a rate day (`YYYY-MM-DD`), which is a calendar date, not a moment. */
function dayName(t: Translator<string>, date: string): string {
  return new Intl.DateTimeFormat(t.language, {
    weekday: `short`,
    day: `numeric`,
    month: `short`,
    timeZone: `UTC`,
  }).format(new Date(`${date}T00:00:00Z`))
}

/** `6 November 2026`: a date in a sentence. */
function longDate(t: Translator<string>, date: string): string {
  return new Intl.DateTimeFormat(t.language, { dateStyle: `long`, timeZone: `UTC` })
    .format(new Date(`${date}T00:00:00Z`))
}

/**
 * The Exchange rates page: the last fetch of each source, the main currencies in use with no rate
 * for the latest rate day, the paid fallback's calls this month, and the last 7 days. It names no
 * household and counts none. A failed last run is a danger notice that points to Jobs.
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
          <PageAction
            label={t.t(`AdminSystem.openJobs`)}
            Icon={IconClock}
            href={ADMIN_JOB_PATHS.list}
            navigate={props.navigate}
            dataE2E="admin-rates-jobs"
          />
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
            <RatesBody snapshot={snapshot} />
          </>
        )}
    </Stack>
  )
}

function RatesBody({ snapshot }: { snapshot: AdminRatesSnapshot }): JSX.Element {
  const t = useAdminText()
  const { lastRun, fetches, missing, fallback } = snapshot
  const failed = lastRun?.failed
    ? (
      <div data-e2e="admin-rates-failed">
        <Notice tone="danger">
          {t.t(`AdminRates.jobFailed`, { time: timeUtc(t, lastRun.at) })}
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
            class="-my-3"
            facts={fetches.map((last) => ({
              label: sourceName(t, last.source),
              value: (
                <span class="tabular-nums">
                  {t.t(`AdminRates.fetch`, {
                    time: timeUtc(t, last.fetchedAt),
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
                {t.t(`AdminRates.missingNone`, { date: longDate(t, missing.date) })}
              </p>
            )
            : (
              <Notice tone="warning">
                <span class="flex flex-col gap-1">
                  <span class="font-medium tabular-nums" translate={false}>
                    {missing.currencies.join(`, `)}
                  </span>
                  <span>{t.t(`AdminRates.missingText`, { date: longDate(t, missing.date) })}</span>
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
                  label={t.t(`AdminRates.fallbackTitle`)}
                  format={(amount) => new Intl.NumberFormat(t.language).format(amount)}
                  labels={{
                    value: (used, cap) => t.t(`AdminRates.fallbackUsage`, { used, cap }),
                    valueOver: (used, cap) => t.t(`AdminRates.fallbackUsage`, { used, cap }),
                  }}
                />
                {fallback.used >= fallback.cap
                  ? (
                    <Notice tone="warning">
                      {t.t(`AdminRates.fallbackCapped`, {
                        date: longDate(t, fallback.resetsOn),
                      })}
                    </Notice>
                  )
                  : (
                    <p class="text-xs text-muted">
                      {t.t(`AdminRates.fallbackHint`, { date: longDate(t, fallback.resetsOn) })}
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

/**
 * The last 7 days, newest first: one row per source that fetched that day. A day with none is a
 * muted row that says so, since the ECB publishes nothing on weekends and holidays.
 */
function RatesByDay({ snapshot }: { snapshot: AdminRatesSnapshot }): JSX.Element {
  const t = useAdminText()
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
  const columns: DataTableColumn<DayRow, never>[] = [
    {
      id: `day`,
      header: t.t(`AdminRates.day`),
      render: (row) => (
        <div class="flex min-w-0 flex-col gap-1" data-weekend={row.source === null || undefined}>
          <span class={row.source === null ? `text-sm text-muted` : `text-sm font-medium`}>
            {dayName(t, row.date)}
          </span>
          <span class="text-xs text-muted sm:hidden">
            {row.source === null
              ? t.t(`AdminRates.weekend`)
              : `${sourceName(t, row.source)} · ${
                t.t(`AdminRates.fetch`, { time: timeUtc(t, row.fetchedAt!), count: row.currencies })
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
          ? muted(t.t(`AdminRates.weekend`))
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
          : <span class="whitespace-nowrap text-sm">{timeUtc(t, row.fetchedAt)}</span>,
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
