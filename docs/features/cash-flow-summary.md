# Cash Flow Summary

## Description
Clear comparison of income versus expenses for the current month with trend indicators.

## Priority: 🔶 Medium (Enhanced Analytics)

## Data Requirements
**Status**: ✅ Complete - Transaction data with types available

### Data Sources
- `transaction.list` signal - Transactions with DEBIT/CREDIT types
- `group.selectedId` signal - Current group context
- Date utilities for current month calculations

## Technical Implementation

### Components Used
- Existing `CurrencyDisplay` component for amounts
- Existing card layout patterns
- Simple progress bar components
- Existing color utilities (green/red for positive/negative)

### Data Processing
```typescript
const currentMonthCashFlow = useComputed(() => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  
  const currentMonthTransactions = transaction.list.value.filter(txn =>
    txn.groupId === group.selectedId.value &&
    !txn.deletedAt &&
    new Date(txn.createdAt) >= startOfMonth &&
    new Date(txn.createdAt) <= endOfMonth
  )
  
  const income = currentMonthTransactions
    .filter(txn => txn.type === TransactionType.CREDIT)
    .reduce((sum, txn) => sum + txn.amount, 0)
    
  const expenses = currentMonthTransactions
    .filter(txn => txn.type === TransactionType.DEBIT)
    .reduce((sum, txn) => sum + txn.amount, 0)
  
  const netFlow = income - expenses
  const incomeCount = currentMonthTransactions.filter(txn => txn.type === TransactionType.CREDIT).length
  const expenseCount = currentMonthTransactions.filter(txn => txn.type === TransactionType.DEBIT).length
  
  return {
    income,
    expenses,
    netFlow,
    incomeCount,
    expenseCount,
    totalTransactions: currentMonthTransactions.length
  }
})

const previousMonthComparison = useComputed(() => {
  const now = new Date()
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0)
  
  const prevMonthTransactions = transaction.list.value.filter(txn =>
    txn.groupId === group.selectedId.value &&
    !txn.deletedAt &&
    new Date(txn.createdAt) >= startOfPrevMonth &&
    new Date(txn.createdAt) <= endOfPrevMonth
  )
  
  const prevIncome = prevMonthTransactions
    .filter(txn => txn.type === TransactionType.CREDIT)
    .reduce((sum, txn) => sum + txn.amount, 0)
    
  const prevExpenses = prevMonthTransactions
    .filter(txn => txn.type === TransactionType.DEBIT)
    .reduce((sum, txn) => sum + txn.amount, 0)
  
  return {
    incomeChange: currentMonthCashFlow.value.income - prevIncome,
    expenseChange: currentMonthCashFlow.value.expenses - prevExpenses,
    netFlowChange: currentMonthCashFlow.value.netFlow - (prevIncome - prevExpenses)
  }
})
```

### Layout Structure
```tsx
<div class="card">
  <div class="card-header">
    <h3>Cash Flow Summary</h3>
    <div class="text-sm text-gray-600">
      {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
    </div>
  </div>
  <div class="card-body">
    {/* Main Cash Flow Display */}
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Income */}
      <div class="text-center p-4 bg-green-50 rounded-lg">
        <div class="text-sm text-green-700 font-medium mb-1">Income</div>
        <div class="text-2xl font-bold text-green-800">
          <CurrencyDisplay 
            amount={currentMonthCashFlow.value.income} 
            currency={defaultCurrency}
          />
        </div>
        <div class="text-xs text-green-600 mt-1">
          {currentMonthCashFlow.value.incomeCount} transactions
        </div>
        {/* Trend indicator */}
        {previousMonthComparison.value.incomeChange !== 0 && (
          <div class={`text-xs mt-1 ${
            previousMonthComparison.value.incomeChange > 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {previousMonthComparison.value.incomeChange > 0 ? '↗' : '↘'} 
            <CurrencyDisplay 
              amount={Math.abs(previousMonthComparison.value.incomeChange)}
              currency={defaultCurrency}
            /> vs last month
          </div>
        )}
      </div>
      
      {/* Expenses */}
      <div class="text-center p-4 bg-red-50 rounded-lg">
        <div class="text-sm text-red-700 font-medium mb-1">Expenses</div>
        <div class="text-2xl font-bold text-red-800">
          <CurrencyDisplay 
            amount={currentMonthCashFlow.value.expenses} 
            currency={defaultCurrency}
          />
        </div>
        <div class="text-xs text-red-600 mt-1">
          {currentMonthCashFlow.value.expenseCount} transactions
        </div>
        {/* Trend indicator */}
        {previousMonthComparison.value.expenseChange !== 0 && (
          <div class={`text-xs mt-1 ${
            previousMonthComparison.value.expenseChange > 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {previousMonthComparison.value.expenseChange > 0 ? '↗' : '↘'} 
            <CurrencyDisplay 
              amount={Math.abs(previousMonthComparison.value.expenseChange)}
              currency={defaultCurrency}
            /> vs last month
          </div>
        )}
      </div>
      
      {/* Net Flow */}
      <div class={`text-center p-4 rounded-lg ${
        currentMonthCashFlow.value.netFlow >= 0 ? 'bg-blue-50' : 'bg-orange-50'
      }`}>
        <div class="text-sm font-medium mb-1">Net Flow</div>
        <div class={`text-2xl font-bold ${
          currentMonthCashFlow.value.netFlow >= 0 ? 'text-blue-800' : 'text-orange-800'
        }`}>
          <CurrencyDisplay 
            amount={currentMonthCashFlow.value.netFlow} 
            currency={defaultCurrency}
            highlightNegative={true}
          />
        </div>
        <div class="text-xs mt-1">
          {currentMonthCashFlow.value.netFlow >= 0 ? 'Surplus' : 'Deficit'}
        </div>
      </div>
    </div>
    
    {/* Visual Flow Comparison */}
    <div class="space-y-3">
      <div class="text-sm font-medium">Income vs Expenses</div>
      <div class="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
        <div 
          class="absolute top-0 left-0 h-full bg-green-400 flex items-center justify-center text-white text-xs font-medium"
          style={{ 
            width: `${Math.max(10, (currentMonthCashFlow.value.income / Math.max(currentMonthCashFlow.value.income, currentMonthCashFlow.value.expenses)) * 100)}%` 
          }}
        >
          Income
        </div>
        <div 
          class="absolute top-0 right-0 h-full bg-red-400 flex items-center justify-center text-white text-xs font-medium"
          style={{ 
            width: `${Math.max(10, (currentMonthCashFlow.value.expenses / Math.max(currentMonthCashFlow.value.income, currentMonthCashFlow.value.expenses)) * 100)}%` 
          }}
        >
          Expenses
        </div>
      </div>
    </div>
    
    {/* Quick Actions */}
    <div class="flex gap-2 mt-4">
      <Link href="/transactions?type=credit" class="btn btn-success btn-sm">
        Add Income
      </Link>
      <Link href="/transactions?type=debit" class="btn btn-danger btn-sm">
        Add Expense
      </Link>
      <Link href="/transactions" class="btn btn-link btn-sm">
        View All Transactions
      </Link>
    </div>
  </div>
</div>
```

## Enhanced Features

### Daily Average Calculations
```typescript
const dailyAverages = useComputed(() => {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysPassed = now.getDate()
  
  return {
    dailyIncomeAvg: currentMonthCashFlow.value.income / daysPassed,
    dailyExpenseAvg: currentMonthCashFlow.value.expenses / daysPassed,
    projectedMonthlyIncome: (currentMonthCashFlow.value.income / daysPassed) * daysInMonth,
    projectedMonthlyExpenses: (currentMonthCashFlow.value.expenses / daysPassed) * daysInMonth
  }
})
```

### Category Breakdown
```tsx
// Top spending categories this month
const topExpenseCategories = useComputed(() => {
  const categoryTotals = new Map()
  
  currentMonthTransactions
    .filter(txn => txn.type === TransactionType.DEBIT)
    .forEach(txn => {
      const category = category.list.value.find(cat => cat.id === txn.categoryId)
      if (category) {
        categoryTotals.set(category.name, (categoryTotals.get(category.name) || 0) + txn.amount)
      }
    })
  
  return Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
})
```

## Real-time Updates
- Updates automatically with new transactions
- Recalculates monthly totals in real-time
- Live trend indicators via WebSocket updates

## Mobile Optimization
- Responsive grid layout for summary cards
- Simplified visual flow chart on small screens
- Touch-friendly quick action buttons

## Implementation Steps
1. Create computed signals for current month cash flow calculations
2. Implement previous month comparison logic
3. Design responsive card layout with three main sections
4. Add visual flow comparison bar
5. Implement trend indicators with arrows and percentages
6. Add quick action buttons for common operations
7. Test edge cases (no transactions, negative flows, etc.)

## Future Enhancements
- **Weekly Breakdown** - Show cash flow by week within month
- **Projection Mode** - Forecast end-of-month totals
- **Category Analysis** - Detailed breakdown by spending categories
- **Goal Tracking** - Compare against monthly budget targets
- **Export Reports** - Generate monthly cash flow reports

## Integration Points
- Links to filtered transaction views
- Integrates with transaction creation forms
- Uses existing currency and formatting utilities
- Maintains consistency with other financial displays
