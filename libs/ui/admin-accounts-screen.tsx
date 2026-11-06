import type { JSX } from "preact"
import { Kpi, KpiGrid } from "@spy4x/preact-charts/kpi"
import { Button } from "@spy4x/preact-ui/button"
import { Card, CardBody, CardHeader } from "@spy4x/preact-ui/card"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Stack } from "@spy4x/preact-ui/layout"
import { Link } from "@spy4x/preact-ui/link"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { AccountKind, type AdminAccountsOverview } from "@domain/accounts"
import { ADMIN_GROUP_PATHS } from "./admin-groups-list.tsx"
import type { Navigate } from "./progressive.tsx"
import { useAdminText } from "./i18n.ts"

/** The accounts module's page in the admin app. */
export const ADMIN_ACCOUNTS_PATH = `/accounts`

const NUMBER = new Intl.NumberFormat("en")

const KIND_NAMES: Record<AccountKind, string> = {
  [AccountKind.CASH]: `AdminAccounts.kindCash`,
  [AccountKind.BANK]: `AdminAccounts.kindBank`,
  [AccountKind.CARD]: `AdminAccounts.kindCard`,
  [AccountKind.SAVINGS]: `AdminAccounts.kindSavings`,
  [AccountKind.ASSET]: `AdminAccounts.kindAsset`,
  [AccountKind.LIABILITY]: `AdminAccounts.kindLiability`,
}

export interface AdminAccountsScreenProps {
  /** The counts, or `null` while they load or when they could not be read. */
  overview: AdminAccountsOverview | null
  /** Why the counts could not be read, or `null`. */
  error: string | null
  onRetry: () => void
  navigate?: Navigate
}

/**
 * How households use accounts: how many there are, by kind and by currency, and the households
 * with the most. Counts and currency codes only: never an account's name or an amount.
 */
export function AdminAccountsScreen(props: AdminAccountsScreenProps): JSX.Element {
  const t = useAdminText()
  const { overview, error } = props
  return (
    <Stack>
      <PageHeader
        title={t.t(`AdminAccounts.title`)}
        subtitle={t.t(`AdminAccounts.subtitle`)}
        titleDataE2E="admin-accounts-title"
      />
      {overview === null
        ? error
          ? (
            <div class="flex flex-col items-start gap-3">
              <ErrorState message={error} dataE2E="admin-accounts-error" />
              <Button variant="secondary" onClick={props.onRetry}>
                {t.t(`AdminAccounts.retry`)}
              </Button>
            </div>
          )
          : (
            <div
              role="status"
              aria-label={t.t(`AdminAccounts.loading`)}
              data-e2e="admin-accounts-loading"
            >
              <LoadingSkeleton rows={6} />
            </div>
          )
        : <Body overview={overview} navigate={props.navigate} />}
    </Stack>
  )
}

function Body(
  { overview, navigate }: { overview: AdminAccountsOverview; navigate?: Navigate },
): JSX.Element {
  const t = useAdminText()
  return (
    <>
      <section aria-label={t.t(`AdminAccounts.keyNumbers`)} data-e2e="admin-accounts-stats">
        <KpiGrid minWidth="11rem">
          <Kpi
            label={t.t(`AdminAccounts.accounts`)}
            value={NUMBER.format(overview.accounts)}
            tone="accent"
          />
          <Kpi
            label={t.t(`AdminAccounts.households`)}
            value={NUMBER.format(overview.households)}
            sub={t.t(`AdminAccounts.householdsHint`)}
            tone="neutral"
          />
          <Kpi
            label={t.t(`AdminAccounts.currencies`)}
            value={NUMBER.format(overview.byCurrency.length)}
            tone="neutral"
          />
        </KpiGrid>
      </section>
      <div class="grid gap-4 lg:grid-cols-2">
        <CountCard
          title={t.t(`AdminAccounts.byKind`)}
          rows={overview.byKind.map((row) => ({
            key: String(row.kind),
            label: t.t(KIND_NAMES[row.kind]),
            count: row.accounts,
          }))}
          dataE2E="admin-accounts-kinds"
        />
        <CountCard
          title={t.t(`AdminAccounts.byCurrency`)}
          rows={overview.byCurrency.map((row) => ({
            key: row.currency,
            label: row.currency,
            count: row.accounts,
          }))}
          dataE2E="admin-accounts-currencies"
        />
      </div>
      <Card data-e2e="admin-accounts-households">
        <CardHeader title={t.t(`AdminAccounts.topHouseholds`)} headingLevel={2} />
        <CardBody>
          {overview.topHouseholds.length === 0
            ? <p class="text-sm text-muted">{t.t(`AdminAccounts.none`)}</p>
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
                    <span class="text-sm text-muted" translate={false}>
                      {household.currencies.join(", ")}
                    </span>
                    <span class="ms-auto text-sm tabular-nums">
                      {t.t(`AdminAccounts.accountCount`, { count: household.accounts })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </CardBody>
      </Card>
    </>
  )
}

/** A card of labels, each with its count, largest first as the server sent them. */
function CountCard(
  { title, rows, dataE2E }: {
    title: string
    rows: { key: string; label: string; count: number }[]
    dataE2E: string
  },
): JSX.Element {
  const t = useAdminText()
  return (
    <Card data-e2e={dataE2E}>
      <CardHeader title={title} headingLevel={2} />
      <CardBody>
        {rows.length === 0
          ? <p class="text-sm text-muted">{t.t(`AdminAccounts.none`)}</p>
          : (
            <dl class="flex flex-col divide-y divide-subtle">
              {rows.map((row) => (
                <div key={row.key} class="flex min-h-10 items-center justify-between gap-3 py-2">
                  <dt class="text-sm">{row.label}</dt>
                  <dd class="text-sm font-medium tabular-nums">{NUMBER.format(row.count)}</dd>
                </div>
              ))}
            </dl>
          )}
      </CardBody>
    </Card>
  )
}
