# Financial Overview Cards

## Description
Display key financial metrics in a card-based layout for immediate visual impact on the dashboard.

## Priority: ⭐ High (Quick Win)

## Data Requirements
**Status**: ✅ Complete - All data available in frontend state

### Data Sources
- `account.list` signal - Account balances and details
- `transaction.list` signal - Transaction history for calculations
- `group.selectedId` signal - Current group context

### Key Metrics
1. **Total Balance** - Sum of all active accounts in selected group
2. **Monthly Income** - Sum of CREDIT transactions for current month
3. **Monthly Expenses** - Sum of DEBIT transactions for current month
4. **Net Worth Change** - Balance change from previous month

## Technical Implementation

### Components Used
- Existing `card` CSS classes for layout
- `CurrencyDisplay` component for proper formatting
- `useComputed` signals for reactive calculations

### Calculation Logic
```typescript
const totalBalance = useComputed(() => 
  account.list.value
    .filter(acc => acc.groupId === group.selectedId.value && !acc.deletedAt)
    .reduce((sum, acc) => sum + acc.balance, 0)
)

const monthlyIncome = useComputed(() => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  return transaction.list.value
    .filter(txn => 
      txn.groupId === group.selectedId.value && 
      txn.type === TransactionType.CREDIT &&
      new Date(txn.createdAt) >= startOfMonth &&
      !txn.deletedAt
    )
    .reduce((sum, txn) => sum + txn.amount, 0)
})
```

### Layout Structure
```tsx
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <div class="card">
    <div class="card-body">
      <h3>Total Balance</h3>
      <CurrencyDisplay amount={totalBalance.value} currency={defaultCurrency} />
    </div>
  </div>
  // ... other cards
</div>
```

## Currency Handling
- Use group's `defaultCurrency` for display
- Handle multi-currency accounts with conversion display
- Leverage existing currency utilities and formatting

## Real-time Updates
- Automatically updates via existing WebSocket connections
- No additional API calls required
- Reactive to account balance changes and new transactions

## Implementation Steps
1. Create computed signals for each metric
2. Design card layout using existing CSS classes
3. Integrate with existing `CurrencyDisplay` component
4. Add responsive grid layout for mobile-first design
5. Test with multi-currency scenarios
