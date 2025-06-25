# Account Balances Overview

## Description
Visual representation of all account balances with trends and quick insights.

## Priority: 🔶 Medium (Enhanced Analytics)

## Data Requirements
**Status**: ✅ Complete - Account data with balances available

### Data Sources
- `account.list` signal - Account details and current balances
- `transaction.list` signal - For balance trend calculations
- `group.selectedId` signal - Current group context

## Technical Implementation

### Components Used
- Existing `CurrencyDisplay` component for proper formatting
- Existing `getCurrencyDisplay` utility for currency symbols
- Existing card layout patterns
- Simple CSS-based progress indicators

### Data Processing
```typescript
const groupAccounts = useComputed(() =>
  account.list.value
    .filter(acc => 
      acc.groupId === group.selectedId.value && 
      !acc.deletedAt
    )
    .sort((a, b) => b.balance - a.balance) // Sort by balance descending
)

const totalBalance = useComputed(() =>
  groupAccounts.value.reduce((sum, acc) => sum + acc.balance, 0)
)

const getBalanceChange = (accountId: number, days: number = 30) => {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  
  const recentTransactions = transaction.list.value
    .filter(txn => 
      txn.accountId === accountId &&
      new Date(txn.createdAt) >= cutoffDate &&
      !txn.deletedAt
    )
  
  return recentTransactions.reduce((sum, txn) => 
    sum + (txn.type === TransactionType.CREDIT ? txn.amount : -txn.amount), 0
  )
}
```

### Layout Structure
```tsx
<div class="card">
  <div class="card-header">
    <h3>Account Balances</h3>
    <div class="text-sm text-gray-600">
      Total: <CurrencyDisplay amount={totalBalance.value} currency={defaultCurrency} />
    </div>
  </div>
  <div class="card-body space-y-3">
    {groupAccounts.value.map(account => (
      <div key={account.id} class="flex items-center justify-between p-3 bg-gray-50 rounded-md">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <div class="font-medium">{account.name}</div>
            <div class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
              {account.currency}
            </div>
          </div>
          <div class="text-sm text-gray-600 mt-1">
            {getBalanceChange(account.id) >= 0 ? '+' : ''}
            <CurrencyDisplay 
              amount={getBalanceChange(account.id)} 
              currency={account.currency} 
            /> this month
          </div>
        </div>
        <div class="text-right">
          <CurrencyDisplay
            amount={account.balance}
            currency={account.currency}
            highlightNegative={true}
            class="font-semibold"
          />
        </div>
      </div>
    ))}
  </div>
</div>
```

## Visual Enhancements

### Balance Trends
- **Green indicator** - Positive balance change
- **Red indicator** - Negative balance change  
- **Percentage change** - Relative change over time period

### Account Health Indicators
```tsx
const getAccountHealth = (balance: number, changeAmount: number) => {
  if (balance < 0) return { color: 'red', status: 'Overdrawn' }
  if (changeAmount < 0 && Math.abs(changeAmount) > balance * 0.1) {
    return { color: 'yellow', status: 'Declining' }
  }
  if (changeAmount > 0) return { color: 'green', status: 'Growing' }
  return { color: 'gray', status: 'Stable' }
}
```

### Multi-Currency Handling
- Group accounts by currency
- Show currency symbols and codes
- Optional conversion to group default currency
- Handle exchange rate display (if rates available)

## Enhanced Features

### Account Categories
```tsx
const accountsByType = useComputed(() => {
  const categories = {
    checking: groupAccounts.value.filter(acc => 
      acc.name.toLowerCase().includes('checking') || 
      acc.name.toLowerCase().includes('current')
    ),
    savings: groupAccounts.value.filter(acc => 
      acc.name.toLowerCase().includes('saving')
    ),
    other: groupAccounts.value.filter(acc => 
      !acc.name.toLowerCase().includes('checking') &&
      !acc.name.toLowerCase().includes('current') &&
      !acc.name.toLowerCase().includes('saving')
    )
  }
  return categories
})
```

### Quick Account Actions
- **View Transactions** - Filter transaction list by account
- **Add Transaction** - Pre-select account in form
- **Edit Account** - Navigate to account settings
- **Transfer** - Quick transfer to another account

## Mobile Optimization
- Responsive card layout
- Simplified view on small screens  
- Touch-friendly account selection
- Horizontal scroll for many accounts

## Implementation Steps
1. Create computed signals for account data and trends
2. Implement balance change calculation function
3. Design card layout with account list
4. Add visual indicators for balance health
5. Implement multi-currency display logic
6. Add quick action buttons for each account
7. Test responsive design and edge cases

## Future Enhancements
- **Account Charts** - Simple balance history graphs
- **Account Goals** - Target balance tracking
- **Account Alerts** - Low balance notifications
- **Account Categories** - Custom account groupings
- **Export Data** - Account balance reports

## Integration Points
- Links to account management pages
- Integrates with transaction filtering
- Uses existing account editing functionality
- Maintains consistency with account list UI
