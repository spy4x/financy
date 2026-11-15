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
import { periodLabel, periodOf, PeriodUnit } from "@spy4x/time/period"
import { type AdminBudgetsOverview, BudgetMethod } from "@domain/budgets"
import { ADMIN_GROUP_PATHS } from "./admin-groups-list.tsx"
import type { Navigate } from "./progressive.tsx"
import { useAdminText } from "./i18n.ts"

/** The budgets module's page in the admin app. */
export const ADMIN_BUDGETS_PATH = `/budgets`

export interface AdminBudgetsScreenProps {
  /** The counts, or `null` while they load or when they could not be read. */
  overview: AdminBudgetsOverview | null
  /** Why the counts could not be read, or `null`. */
  error: string | null
  onRetry: () => void
  navigate?: Navigate
}

/**
 * How households budget this month: how many have limits, how many categories, who uses envelopes,
 * and per household its count, method and latest change day. Never an amount, a currency or a
 * category name, since they say how much a household plans to spend and on what.
 */
export function AdminBudgetsScreen(props: AdminBudgetsScreenProps): JSX.Element {
  const t = useAdminText()
  const { overview, error } = props
  return (
    <Stack>
      {/* The intro wraps in its own paragraph: the library's subtitle truncates on a phone. */}
      <div class="flex min-w-0 flex-col gap-1">
        <PageHeader title={t.t(`AdminBudgets.title`)} titleDataE2E="admin-budgets-title" />
        <p dir="auto" class="text-sm text-muted break-words" data-e2e="admin-budgets-intro">
          {t.t(`AdminBudgets.subtitle`)}
        </p>
      </div>
      {overview === null
        ? error
          ? (
            <div class="flex flex-col items-start gap-3">
              <ErrorState message={error} dataE2E="admin-budgets-error" />
              <Button variant="secondary" class="max-sm:min-h-11" onClick={props.onRetry}>
                {t.t(`AdminBudgets.retry`)}
              </Button>
            </div>
          )
          : (
            <div
              role="status"
              aria-label={t.t(`AdminBudgets.loading`)}
              data-e2e="admin-budgets-loading"
            >
              <LoadingSkeleton rows={6} />
            </div>
          )
        : overview.topHouseholds.length === 0
        ? (
          <div data-e2e="admin-budgets-empty">
            <EmptyState
              title={t.t(`AdminBudgets.none`)}
              description={t.t(`AdminBudgets.noneHint`)}
              headingLevel={2}
            />
          </div>
        )
        : <Body overview={overview} navigate={props.navigate} />}
    </Stack>
  )
}

function Body(
  { overview, navigate }: { overview: AdminBudgetsOverview; navigate?: Navigate },
): JSX.Element {
  const t = useAdminText()
  const format = useFormat()
  const utc = format.utc()
  const month = periodLabel(periodOf(PeriodUnit.Month, `${overview.month}-01`), format.locale)
  return (
    <>
      <section aria-label={t.t(`AdminBudgets.keyNumbers`)} data-e2e="admin-budgets-stats">
        <p class="mb-2 text-sm text-muted" data-e2e="admin-budgets-month">
          {t.t(`AdminBudgets.month`, { month })}
        </p>
        <KpiGrid minWidth="11rem">
          <Kpi
            label={t.t(`AdminBudgets.households`)}
            value={format.number(overview.households)}
            sub={t.t(`AdminBudgets.householdsHint`)}
            tone="accent"
          />
          <Kpi
            label={t.t(`AdminBudgets.categories`)}
            value={format.number(overview.categories)}
            sub={t.t(`AdminBudgets.categoriesHint`)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminBudgets.envelopes`)}
            value={format.number(overview.envelopeHouseholds)}
            sub={t.t(`AdminBudgets.envelopesHint`)}
            tone="neutral"
          />
        </KpiGrid>
      </section>
      <Card data-e2e="admin-budgets-households">
        <CardHeader title={t.t(`AdminBudgets.topHouseholds`)} headingLevel={2} />
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
                  <span class="ms-auto shrink-0">
                    <Badge
                      text={household.method === BudgetMethod.ENVELOPES
                        ? t.t(`AdminBudgets.methodEnvelopes`)
                        : t.t(`AdminBudgets.methodLimits`)}
                      color={household.method === BudgetMethod.ENVELOPES ? `blue` : `gray`}
                      type="outline"
                    />
                  </span>
                </div>
                <p class="flex flex-wrap justify-between gap-x-3 text-sm">
                  <span class="font-medium tabular-nums">
                    {t.t(`AdminBudgets.categoryCount`, { count: household.categories })}
                  </span>
                  <span class="text-xs text-muted">
                    {t.t(`AdminBudgets.householdLastChange`, {
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
