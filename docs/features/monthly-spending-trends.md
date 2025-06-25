# Monthly Spending Trends

## Description
Simple visualization showing spending patterns over the last 6 months to identify trends and patterns.

## Priority: 🔶 Medium (Enhanced Analytics)

## Data Requirements
**Status**: ✅ Complete - Transaction history available for trend analysis

### Data Sources
- `transaction.list` signal - Complete transaction history
- `group.selectedId` signal - Current group context
- `category.list` signal - Category names for breakdown

## Technical Implementation

### Components Used
- Existing card layout patterns
- Simple CSS-based bar charts or lightweight chart library
- Existing `CurrencyDisplay` component
- Existing color utilities from TailwindCSS

### Data Processing
```typescript
const monthlySpendingData = useComputed(() => {
  const months = []
  const now = new Date()
  
  // Generate last 6 months
  for (let i = 5; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    
    const monthTransactions = transaction.list.value.filter(txn =>
      txn.groupId === group.selectedId.value &&
      !txn.deletedAt &&
      new Date(txn.createdAt) >= monthDate &&
      new Date(txn.createdAt) < nextMonth
    )
    
    const expenses = monthTransactions
      .filter(txn => txn.type === TransactionType.DEBIT)
      .reduce((sum, txn) => sum + txn.amount, 0)
      
    const income = monthTransactions
      .filter(txn => txn.type === TransactionType.CREDIT)
      .reduce((sum, txn) => sum + txn.amount, 0)
    
    months.push({
      date: monthDate,
      label: monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      expenses,
      income,
      net: income - expenses,
      transactionCount: monthTransactions.length
    })
  }
  
  return months
})

const maxAmount = useComputed(() =>
  Math.max(...monthlySpendingData.value.map(m => Math.max(m.expenses, m.income)))
)
```

### CSS-Based Bar Chart
```tsx
<div class="card">
  <div class="card-header">
    <h3>6-Month Spending Trends</h3>
  </div>
  <div class="card-body">
    <div class="space-y-4">
      {monthlySpendingData.value.map(month => (
        <div key={month.label} class="space-y-2">
          <div class="flex items-center justify-between text-sm">
            <span class="font-medium">{month.label}</span>
            <div class="flex gap-4 text-xs">
              <span class="text-red-600">
                Expenses: <CurrencyDisplay amount={month.expenses} currency={defaultCurrency} />
              </span>
              <span class="text-green-600">
                Income: <CurrencyDisplay amount={month.income} currency={defaultCurrency} />
              </span>
            </div>
          </div>
          
          {/* Simple CSS Bar Chart */}
          <div class="relative h-8 bg-gray-100 rounded">
            <div 
              class="absolute top-0 left-0 h-full bg-red-200 rounded"
              style={{ width: `${(month.expenses / maxAmount.value) * 100}%` }}
            />
            <div 
              class="absolute top-0 left-0 h-full bg-green-200 rounded opacity-75"
              style={{ width: `${(month.income / maxAmount.value) * 100}%` }}
            />
            <div class="absolute inset-0 flex items-center justify-center text-xs font-medium">
              Net: <CurrencyDisplay 
                amount={month.net} 
                currency={defaultCurrency}
                class={month.net >= 0 ? 'text-green-700' : 'text-red-700'}
              />
            </div>
          </div>
          
          <div class="text-xs text-gray-500 text-center">
            {month.transactionCount} transactions
          </div>
        </div>
      ))}
    </div>
  </div>
</div>
```

## Enhanced Visualization Options

### Lightweight Chart Library Integration
If more advanced charts are needed, consider minimal libraries:

```typescript
// Option 1: Chart.js (minimal build)
import { Chart } from 'chart.js/auto'

// Option 2: Recharts (React-compatible)
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from 'recharts'

// Option 3: D3.js (minimal selection)
import { select, scaleLinear, scaleBand } from 'd3'
```

### Category Breakdown
```typescript
const categoryTrends = useComputed(() => {
  return category.list.value
    .filter(cat => cat.groupId === group.selectedId.value && !cat.deletedAt)
    .map(cat => {
      const monthlyData = monthlySpendingData.value.map(month => {
        const categoryExpenses = transaction.list.value
          .filter(txn =>
            txn.categoryId === cat.id &&
            txn.type === TransactionType.DEBIT &&
            // ... date filtering logic
          )
          .reduce((sum, txn) => sum + txn.amount, 0)
        
        return { month: month.label, amount: categoryExpenses }
      })
      
      return { category: cat.name, data: monthlyData }
    })
    .filter(cat => cat.data.some(m => m.amount > 0))
})
```

## Summary Statistics
```tsx
<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
  <div class="text-center p-3 bg-blue-50 rounded">
    <div class="text-sm text-gray-600">Avg Monthly Expenses</div>
    <div class="font-semibold">
      <CurrencyDisplay 
        amount={monthlySpendingData.value.reduce((sum, m) => sum + m.expenses, 0) / 6}
        currency={defaultCurrency}
      />
    </div>
  </div>
  {/* Similar cards for income, net, etc. */}
</div>
```

## Mobile Optimization
- Horizontal scroll for chart area
- Simplified chart layout on small screens
- Touch-friendly interaction areas
- Responsive grid for summary stats

## Implementation Steps
1. Create computed signals for monthly data aggregation
2. Implement CSS-based bar chart visualization
3. Add summary statistics cards
4. Design responsive layout for mobile
5. Add category breakdown option
6. Test performance with large transaction datasets
7. Consider chart library integration for advanced features

## Alternative Libraries (Lightweight Options)
- **Chart.js** - Minimal build, good performance
- **Recharts** - React-compatible, modern API
- **Observable Plot** - Grammar of graphics, lightweight
- **CSS-only charts** - No dependencies, limited features

## Future Enhancements
- **Interactive Charts** - Click to drill down to transactions
- **Date Range Selection** - Custom time periods
- **Comparison Mode** - Compare current vs previous periods
- **Export Charts** - Save as images or data
- **Trend Predictions** - Simple forecasting based on patterns

## Integration Points
- Links to detailed transaction views
- Filters transactions by date ranges
- Integrates with category management
- Maintains consistency with existing data display patterns
