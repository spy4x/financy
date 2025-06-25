import { useComputed } from "@preact/signals"
import { group } from "../../state/group.ts"
import { PageTitle } from "../../components/ui/PageTitle.tsx"
import { FinancialOverviewCards } from "./components/financial-overview-cards.tsx"
import { QuickActionsPanel } from "./components/quick-actions-panel.tsx"
import { RecentTransactionsList } from "./components/recent-transactions-list.tsx"
import { BudgetProgressBars } from "./components/budget-progress-bars.tsx"
import { AccountBalancesOverview } from "./components/account-balances-overview.tsx"

export function Dashboard() {
  const hasSelectedGroup = useComputed(() => !!group.selectedId.value)

  if (!hasSelectedGroup.value) {
    return (
      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <PageTitle>Dashboard</PageTitle>
        <div class="mt-8 text-center">
          <div class="card max-w-md mx-auto">
            <div class="card-body">
              <h3 class="text-lg font-medium text-gray-900 mb-2">Welcome to Financy!</h3>
              <p class="text-gray-600 mb-4">
                To get started, please select or create a group from the navigation menu.
              </p>
              <div class="text-sm text-gray-500">
                Groups help you organize your finances and collaborate with others.
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageTitle>Dashboard</PageTitle>

      <div class="mt-8 space-y-8">
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

        {/* Recent Transactions */}
        <RecentTransactionsList />
      </div>
    </div>
  )
}
