# Quick Actions Panel

## Description
Fast access panel for common financial operations to improve user workflow efficiency.

## Priority: ⭐ High (Quick Win)

## Data Requirements
**Status**: ✅ Complete - All necessary data available

### Data Sources
- `group.selectedId` signal - Ensure group is selected before enabling actions
- Existing router patterns for navigation
- Existing form validation logic

## Technical Implementation

### Components Used
- Existing button styles (`btn`, `btn-primary`, etc.)
- Existing icons from `@client/icons`
- Existing router navigation (`navigate`, `Link`)
- Existing validation patterns

### Quick Actions List
1. **Add Transaction** - Navigate to transaction create form
2. **Add Account** - Navigate to account create form  
3. **Add Category** - Navigate to category create form
4. **Transfer Money** - Quick transfer between accounts (future)
5. **View Reports** - Navigate to analytics/reports (future)

### Layout Structure
```tsx
<div class="card">
  <div class="card-header">
    <h3>Quick Actions</h3>
  </div>
  <div class="card-body">
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      <button
        type="button"
        class={`btn btn-primary flex flex-col items-center gap-2 p-4 ${
          !group.selectedId.value ? 'btn-disabled cursor-not-allowed' : ''
        }`}
        onClick={() => group.selectedId.value && navigate('/transactions/create')}
        disabled={!group.selectedId.value}
        title={!group.selectedId.value ? 'Please select a group first' : 'Add Transaction'}
      >
        <IconPlus class="size-6" />
        <span class="text-sm">Add Transaction</span>
      </button>
      // ... other action buttons
    </div>
  </div>
</div>
```

### Action Button Design
Each button includes:
- **Icon** - Visual representation of action
- **Label** - Clear action description
- **Disabled State** - When group not selected
- **Tooltip** - Helpful guidance text
- **Responsive** - Adapts to screen size

### Validation Logic
```typescript
const canPerformActions = useComputed(() => 
  !!group.selectedId.value && 
  group.list.value.some(g => g.id === group.selectedId.value && !g.deletedAt)
)

const actionButtons = [
  {
    label: 'Add Transaction',
    icon: IconPlus,
    href: '/transactions/create',
    description: 'Record a new income or expense'
  },
  {
    label: 'Add Account', 
    icon: IconBuildingOffice2,
    href: '/accounts/create',
    description: 'Create a new account'
  },
  {
    label: 'Add Category',
    icon: IconFolder, 
    href: '/categories/create',
    description: 'Create a new spending category'
  }
]
```

## Enhanced Features

### Contextual Actions
- Show different actions based on available data
- Highlight most-used actions based on user behavior
- Conditional display based on user permissions

### Quick Stats Integration
```tsx
// Show quick stats with actions
<div class="flex items-center justify-between mb-4">
  <div class="text-sm text-gray-600">
    {account.list.value.length} accounts • {category.list.value.length} categories
  </div>
  <div class="text-sm text-gray-600">
    {transaction.list.value.length} transactions this month
  </div>
</div>
```

## Mobile Optimization
- Touch-friendly button sizing (minimum 44px)
- Simplified grid layout on narrow screens
- Clear visual hierarchy
- Accessible button labels

## Implementation Steps
1. Design button grid layout with existing styles
2. Implement group selection validation
3. Add navigation handlers for each action
4. Create responsive design for different screen sizes
5. Add helpful tooltips and disabled states
6. Test accessibility and touch interactions

## Future Enhancements
- **Recent Actions** - Show last performed actions
- **Favorites** - Allow users to pin most-used actions
- **Keyboard Shortcuts** - Add hotkeys for power users
- **Transfer Money** - Quick account-to-account transfers
- **Quick Reports** - One-click expense summaries

## Integration Points
- Uses existing routing and navigation patterns
- Maintains consistency with action buttons throughout app
- Respects existing permission and validation logic
- Links to existing create/edit forms
