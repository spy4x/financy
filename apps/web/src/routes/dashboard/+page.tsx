import { PageTitle } from "../../components/ui/PageTitle.tsx"
import { FinancialOverviewCards } from "./components/financial-overview-cards.tsx"
import { QuickActionsPanel } from "./components/quick-actions-panel.tsx"
import { RecentTransactionsList } from "./components/recent-transactions-list.tsx"
import { BudgetProgressBars } from "./components/budget-progress-bars.tsx"
import { AccountBalancesOverview } from "./components/account-balances-overview.tsx"
import { CashFlowSummary } from "./components/cash-flow-summary.tsx"
import { MonthlySpendingTrends } from "./components/monthly-spending-trends.tsx"
import { CategorySpendingBreakdown } from "./components/category-spending-breakdown.tsx"
import { ExchangeRateWidget } from "./components/exchange-rate-widget.tsx"

export function Dashboard() {
  return (
    <section class="page-layout">
      <PageTitle>Dashboard</PageTitle>

      <div class="space-y-8">
        {/* Financial Overview Cards */}
        <FinancialOverviewCards />

        {/* Quick Actions Panel */}
        <QuickActionsPanel />

        {/* Two-column layout for Budget and Account info */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Budget Progress Bars */}
          <BudgetProgressBars />

          {/* Account Balances Overview */}
          <AccountBalancesOverview />
        </div>

        {/* Analytics Section - Two-column layout for Cash Flow and Spending Trends */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Cash Flow Summary */}
          <CashFlowSummary />

          {/* Monthly Spending Trends */}
          <MonthlySpendingTrends />
        </div>

        {/* Advanced Analytics Section - Two-column layout */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Category Spending Breakdown */}
          <CategorySpendingBreakdown />

          {/* Exchange Rate Widget */}
          <ExchangeRateWidget />
        </div>

        {/* Recent Transactions */}
        <RecentTransactionsList />
      </div>
    </section>
  )
}
