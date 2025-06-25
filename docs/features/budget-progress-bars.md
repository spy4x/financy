# Budget Progress Bars

## Description
Visual representation of spending progress against monthly budgets for each category with spending limits.

## Priority: ⭐ High (Quick Win)

## Data Requirements
**Status**: ✅ Complete - Existing `BudgetProgress` component already implemented

### Data Sources
- `category.list` signal - Categories with `monthlyLimit` values
- `transaction.list` signal - Transaction history for spent calculations
- `group.selectedId` signal - Current group context

## Technical Implementation

### Components Used
- **Existing** `BudgetProgress` component (already built and working)
- Existing `CurrencyDisplay` for amount formatting
- Existing card layout patterns

### Calculation Logic
```typescript
const categoriesWithBudgets = useComputed(() => 
  category.list.value
    .filter(cat => 
      cat.groupId === group.selectedId.value && 
      cat.monthlyLimit && 
      cat.monthlyLimit > 0 &&
      !cat.deletedAt
    )
)

const getMonthlySpent = (categoryId: number) => {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  
  return transaction.list.value
    .filter(txn =>
      txn.categoryId === categoryId &&
      txn.type === TransactionType.DEBIT &&
      new Date(txn.createdAt) >= startOfMonth &&
      !txn.deletedAt
    )
    .reduce((sum, txn) => sum + txn.amount, 0)
}
```

### Layout Structure
```tsx
<div class="card">
  <div class="card-header">
    <h3>Budget Progress</h3>
    <Link href="/categories" class="btn btn-link">Manage Budgets</Link>
  </div>
  <div class="card-body space-y-4">
    {categoriesWithBudgets.value.map(category => (
      <div key={category.id}>
        <div class="flex justify-between items-center mb-2">
          <span class="font-medium">{category.name}</span>
          <span class="text-sm text-gray-600">
            {getMonthlySpent(category.id)} / {category.monthlyLimit}
          </span>
        </div>
        <BudgetProgress
          spentAmount={getMonthlySpent(category.id)}
          limitAmount={category.monthlyLimit}
          currency={group.defaultCurrency}
        />
      </div>
    ))}
  </div>
</div>
```

## Budget Status Indicators
The existing `BudgetProgress` component already handles:
- **Green** - Under budget (< 80% spent)
- **Yellow** - Warning zone (80-95% spent)  
- **Red** - Over budget (> 100% spent)
- **Orange** - At limit (95-100% spent)

## Additional Features
- **No Budget Categories** - Show categories without limits with suggestion to add budgets
- **Budget Summary** - Total budgeted vs total spent across all categories
- **Quick Actions** - Link to edit category budgets

### Enhanced Display
```tsx
// Show categories without budgets
{categoriesWithoutBudgets.value.length > 0 && (
  <div class="mt-4 p-3 bg-blue-50 rounded-md">
    <p class="text-sm text-blue-800">
      {categoriesWithoutBudgets.value.length} categories don't have budgets set.
    </p>
    <Link href="/categories" class="text-blue-600 text-sm underline">
      Add budgets →
    </Link>
  </div>
)}
```

## Real-time Updates
- Updates automatically when transactions are added/modified
- Recalculates spending when category budgets change
- Live progress bar animations via existing component

## Mobile Optimization
- Responsive progress bar sizing
- Touch-friendly interaction areas
- Simplified view for narrow screens

## Implementation Steps
1. ✅ `BudgetProgress` component already exists and working
2. Create computed signals for categories with budgets
3. Implement monthly spending calculation function
4. Design card layout for multiple progress bars
5. Add summary information and quick actions
6. Test real-time updates and edge cases

## Integration Points
- Links to category management page
- Uses existing category budget editing functionality
- Consistent with existing budget progress displays in category editor
