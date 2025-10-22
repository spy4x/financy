import { PageTitle } from "../../components/ui/PageTitle.tsx"
import { DateRangeSelector } from "../../components/ui/DateRangeSelector.tsx"
import { FinancialOverviewCards } from "./components/financial-overview-cards.tsx"
import { TopTransactionsList } from "./components/top-transactions-list.tsx"
import { BudgetProgressBars } from "./components/budget-progress-bars.tsx"
import { AccountBalancesOverview } from "./components/account-balances-overview.tsx"
import { CashFlowSummary } from "./components/cash-flow-summary.tsx"
import { MonthlySpendingTrends } from "./components/monthly-spending-trends.tsx"
import { CategorySpendingBreakdown } from "./components/category-spending-breakdown.tsx"
import { ExchangeRateWidget } from "./components/exchange-rate-widget.tsx"
import { IncomeByCategoryWidget } from "./components/income-by-category-widget.tsx"
import { MultiCurrencyDashboard } from "../../components/MultiCurrencyDashboard.tsx"
import { account } from "@web/state/account.ts"
import { group } from "@web/state/group.ts"
import { useComputed } from "@preact/signals"

export function Dashboard() {
  // Check if the selected group has multiple currencies in use
  const hasMultipleCurrencies = useComputed(() => {
    const selectedGroupId = group.selectedId.value
    if (!selectedGroupId) return false

    const groupAccounts = account.list.value.filter(
      (acc) => acc.groupId === selectedGroupId && !acc.deletedAt,
    )

    // Get unique currency IDs from accounts
    const uniqueCurrencies = new Set(groupAccounts.map((acc) => acc.currencyId))
    return uniqueCurrencies.size > 1
  })

  return (
    <section class="page-layout">
      <div class="flex flex-col gap-4 mb-6 md:flex-row md:justify-between md:items-center">
        <PageTitle>Dashboard</PageTitle>
        <DateRangeSelector />
      </div>

      <div class="space-y-8">
        {/* Multi-Currency Dashboard - Show when group has multiple currencies */}
        {hasMultipleCurrencies.value && (
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Multi-Currency Overview
            </h2>
            <MultiCurrencyDashboard />
          </div>
        )}

        <FinancialOverviewCards />
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <BudgetProgressBars />
          <AccountBalancesOverview />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CashFlowSummary />
          <MonthlySpendingTrends />
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CategorySpendingBreakdown />
          <IncomeByCategoryWidget />
        </div>
        <ExchangeRateWidget />
        <TopTransactionsList />
      </div>
    </section>
  )
}
