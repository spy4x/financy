import type { JSX } from "preact"
import { Kpi, KpiGrid } from "@spy4x/preact-charts/kpi"
import { Button } from "@spy4x/preact-ui/button"
import { Card, CardBody, CardHeader } from "@spy4x/preact-ui/card"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Stack } from "@spy4x/preact-ui/layout"
import { Link } from "@spy4x/preact-ui/link"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { type AdminCategoriesOverview, CategoryKind } from "@domain/categories"
import { ADMIN_GROUP_PATHS } from "./admin-groups-list.tsx"
import type { Navigate } from "./progressive.tsx"
import { useAdminText } from "./i18n.ts"

/** The categories module's page in the admin app. */
export const ADMIN_CATEGORIES_PATH = `/categories`

const NUMBER = new Intl.NumberFormat("en")

const KIND_NAMES: Record<CategoryKind, string> = {
  [CategoryKind.EXPENSE]: `AdminCategories.kindExpense`,
  [CategoryKind.INCOME]: `AdminCategories.kindIncome`,
}

export interface AdminCategoriesScreenProps {
  /** The counts, or `null` while they load or when they could not be read. */
  overview: AdminCategoriesOverview | null
  /** Why the counts could not be read, or `null`. */
  error: string | null
  onRetry: () => void
  navigate?: Navigate
}

/**
 * How households use categories: how many there are, archived and nested, by kind, and the
 * households with the most. Counts only: never a category's name, icon or colour, since a name
 * like "Therapy" says something personal.
 */
export function AdminCategoriesScreen(props: AdminCategoriesScreenProps): JSX.Element {
  const t = useAdminText()
  const { overview, error } = props
  return (
    <Stack>
      {/* The intro wraps in its own paragraph: the library's subtitle truncates on a phone. */}
      <div class="flex min-w-0 flex-col gap-1">
        <PageHeader title={t.t(`AdminCategories.title`)} titleDataE2E="admin-categories-title" />
        <p dir="auto" class="text-sm text-muted break-words" data-e2e="admin-categories-intro">
          {t.t(`AdminCategories.subtitle`)}
        </p>
      </div>
      {overview === null
        ? error
          ? (
            <div class="flex flex-col items-start gap-3">
              <ErrorState message={error} dataE2E="admin-categories-error" />
              <Button variant="secondary" onClick={props.onRetry}>
                {t.t(`AdminCategories.retry`)}
              </Button>
            </div>
          )
          : (
            <div
              role="status"
              aria-label={t.t(`AdminCategories.loading`)}
              data-e2e="admin-categories-loading"
            >
              <LoadingSkeleton rows={6} />
            </div>
          )
        : <Body overview={overview} navigate={props.navigate} />}
    </Stack>
  )
}

function Body(
  { overview, navigate }: { overview: AdminCategoriesOverview; navigate?: Navigate },
): JSX.Element {
  const t = useAdminText()
  return (
    <>
      <section aria-label={t.t(`AdminCategories.keyNumbers`)} data-e2e="admin-categories-stats">
        <KpiGrid minWidth="11rem">
          <Kpi
            label={t.t(`AdminCategories.categories`)}
            value={NUMBER.format(overview.categories)}
            tone="accent"
          />
          <Kpi
            label={t.t(`AdminCategories.archived`)}
            value={NUMBER.format(overview.archived)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminCategories.subcategories`)}
            value={NUMBER.format(overview.subcategories)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminCategories.households`)}
            value={NUMBER.format(overview.households)}
            sub={t.t(`AdminCategories.householdsHint`)}
            tone="neutral"
          />
        </KpiGrid>
      </section>
      <div class="grid gap-4 lg:grid-cols-2">
        <Card data-e2e="admin-categories-kinds">
          <CardHeader title={t.t(`AdminCategories.byKind`)} headingLevel={2} />
          <CardBody>
            <dl class="flex flex-col divide-y divide-subtle">
              {overview.byKind.map((row) => (
                <div key={row.kind} class="flex min-h-10 items-center justify-between gap-3 py-2">
                  <dt class="text-sm">{t.t(KIND_NAMES[row.kind])}</dt>
                  <dd class="text-sm font-medium tabular-nums">
                    {NUMBER.format(row.categories)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card data-e2e="admin-categories-households">
          <CardHeader title={t.t(`AdminCategories.topHouseholds`)} headingLevel={2} />
          <CardBody>
            {overview.topHouseholds.length === 0
              ? <p class="text-sm text-muted">{t.t(`AdminCategories.none`)}</p>
              : (
                <ul class="flex flex-col divide-y divide-subtle">
                  {overview.topHouseholds.map((household) => (
                    <li
                      key={household.groupId}
                      class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2"
                    >
                      <Link
                        href={ADMIN_GROUP_PATHS.group(household.groupId)}
                        navigate={navigate}
                        class="min-w-0 truncate font-medium"
                      >
                        <bdi>{household.groupName}</bdi>
                      </Link>
                      <span class="ms-auto text-sm tabular-nums">
                        {t.t(`AdminCategories.categoryCount`, { count: household.categories })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}
