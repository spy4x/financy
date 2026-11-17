import type { JSX } from "preact"
import { Kpi, KpiGrid } from "@spy4x/preact-charts/kpi"
import { Badge } from "@spy4x/preact-ui/badge"
import { Button } from "@spy4x/preact-ui/button"
import { Card, CardBody, CardHeader } from "@spy4x/preact-ui/card"
import { EmptyState } from "@spy4x/preact-ui/empty-state"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { useFormat } from "@spy4x/preact-ui/format"
import { Stack } from "@spy4x/preact-ui/layout"
import { Link } from "@spy4x/preact-ui/link"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import type { AdminRecurringOverview } from "@domain/recurring"
import { ADMIN_GROUP_PATHS } from "./admin-groups-list.tsx"
import type { Navigate } from "./progressive.tsx"
import { useAdminText } from "./i18n.ts"

/** The repeating entries module's page in the admin app. */
export const ADMIN_RECURRING_PATH = `/recurring`

export interface AdminRecurringScreenProps {
  /** The counts, or `null` while they load or when they could not be read. */
  overview: AdminRecurringOverview | null
  /** Why the counts could not be read, or `null`. */
  error: string | null
  onRetry: () => void
  navigate?: Navigate
}

/**
 * How households use repeating entries: how many households and rules, how many are paused, how
 * many entries the rules made, and per household those counts and its latest change day. Never an
 * amount, a currency, a memo or a schedule, since they say what a household pays and how often.
 */
export function AdminRecurringScreen(props: AdminRecurringScreenProps): JSX.Element {
  const t = useAdminText()
  const { overview, error } = props
  return (
    <Stack>
      {/* The intro wraps in its own paragraph: the library's subtitle truncates on a phone. */}
      <div class="flex min-w-0 flex-col gap-1">
        <PageHeader title={t.t(`AdminRecurring.title`)} titleDataE2E="admin-recurring-title" />
        <p dir="auto" class="text-sm text-muted break-words" data-e2e="admin-recurring-intro">
          {t.t(`AdminRecurring.subtitle`)}
        </p>
      </div>
      {overview === null
        ? error
          ? (
            <div class="flex flex-col items-start gap-3">
              <ErrorState message={error} dataE2E="admin-recurring-error" />
              <Button variant="secondary" class="max-sm:min-h-11" onClick={props.onRetry}>
                {t.t(`AdminRecurring.retry`)}
              </Button>
            </div>
          )
          : (
            <div
              role="status"
              aria-label={t.t(`AdminRecurring.loading`)}
              data-e2e="admin-recurring-loading"
            >
              <LoadingSkeleton rows={6} />
            </div>
          )
        : overview.topHouseholds.length === 0
        ? (
          <div data-e2e="admin-recurring-empty">
            <EmptyState
              title={t.t(`AdminRecurring.none`)}
              description={t.t(`AdminRecurring.noneHint`)}
              headingLevel={2}
            />
          </div>
        )
        : <Body overview={overview} navigate={props.navigate} />}
    </Stack>
  )
}

function Body(
  { overview, navigate }: { overview: AdminRecurringOverview; navigate?: Navigate },
): JSX.Element {
  const t = useAdminText()
  const format = useFormat()
  const utc = format.utc()
  return (
    <>
      <section aria-label={t.t(`AdminRecurring.keyNumbers`)} data-e2e="admin-recurring-stats">
        <KpiGrid minWidth="11rem">
          <Kpi
            label={t.t(`AdminRecurring.households`)}
            value={format.number(overview.households)}
            sub={t.t(`AdminRecurring.householdsHint`)}
            tone="accent"
          />
          <Kpi
            label={t.t(`AdminRecurring.rules`)}
            value={format.number(overview.rules)}
            sub={t.t(`AdminRecurring.rulesHint`)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminRecurring.paused`)}
            value={format.number(overview.paused)}
            sub={t.t(`AdminRecurring.pausedHint`)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminRecurring.made`)}
            value={format.number(overview.made)}
            sub={t.t(`AdminRecurring.madeHint`)}
            tone="neutral"
          />
        </KpiGrid>
      </section>
      <Card data-e2e="admin-recurring-households">
        <CardHeader title={t.t(`AdminRecurring.topHouseholds`)} headingLevel={2} />
        <CardBody>
          <ul class="grid grid-cols-1 divide-y divide-subtle">
            {overview.topHouseholds.map((household) => (
              <li key={household.groupId} class="flex flex-col gap-1 py-3">
                <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={ADMIN_GROUP_PATHS.group(household.groupId)}
                    navigate={navigate}
                    class="inline-flex min-h-11 min-w-0 items-center font-medium sm:min-h-9"
                  >
                    <bdi class="min-w-0 line-clamp-2 break-words">{household.groupName}</bdi>
                  </Link>
                  {household.paused > 0 && (
                    <span class="ms-auto shrink-0">
                      <Badge
                        text={t.t(`AdminRecurring.pausedCount`, { count: household.paused })}
                        tone="warning"
                        variant="outline"
                      />
                    </span>
                  )}
                </div>
                <p class="flex flex-wrap justify-between gap-x-3 text-sm">
                  <span class="font-medium tabular-nums">
                    {t.t(`AdminRecurring.ruleCount`, { count: household.rules })}
                    {` · `}
                    {t.t(`AdminRecurring.madeCount`, { count: household.made })}
                  </span>
                  <span class="text-xs text-muted">
                    {t.t(`AdminRecurring.householdLastChange`, {
                      date: utc.date(household.lastChangeDate),
                    })}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  )
}
