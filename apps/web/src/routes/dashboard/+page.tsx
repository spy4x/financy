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

export function Dashboard() {
  return (
    <section class="page-layout">
      <div class="flex flex-col gap-4 mb-6 md:flex-row md:justify-between md:items-center">
        <PageTitle>Dashboard</PageTitle>
        <DateRangeSelector />
      </div>

      <div class="space-y-8">
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
