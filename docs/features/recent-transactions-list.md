# Recent Transactions List

## Description
Display the latest 5-10 transactions with quick action buttons for editing and management.

## Priority: ⭐ High (Quick Win)

## Data Requirements
**Status**: ✅ Complete - All data available in frontend state

### Data Sources
- `transaction.list` signal - Complete transaction history
- `account.list` signal - Account names for display
- `category.list` signal - Category names for display
- `group.selectedId` signal - Current group context

## Technical Implementation

### Components Used
- Existing `Table` component (reuse from transaction list page)
- Existing `Dropdown` component for quick actions
- Existing `CurrencyDisplay` component for amounts
- Existing icons (`IconPencilSquare`, `IconTrashBin`, etc.)

### Data Processing
```typescript
const recentTransactions = useComputed(() => 
  transaction.list.value
    .filter(txn => 
      txn.groupId === group.selectedId.value && 
      !txn.deletedAt
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10) // Show latest 10 transactions
)
```

### Table Structure
| Column | Data | Component |
|--------|------|-----------|
| Date | `txn.createdAt` | Formatted date string |
| Description | `txn.memo` | Text with truncation |
| Category | `category.name` | Lookup from category list |
| Account | `account.name` | Lookup from account list |
| Amount | `txn.amount` | `CurrencyDisplay` with type styling |
| Actions | Quick menu | `Dropdown` with edit/delete options |

### Quick Actions
- **Edit** - Navigate to transaction edit form
- **Delete** - Soft delete with confirmation
- **Duplicate** - Pre-fill new transaction form
- **View Details** - Expand for additional information

### Layout Design
```tsx
<div class="card">
  <div class="card-header">
    <h3>Recent Transactions</h3>
    <Link href="/transactions" class="btn btn-link">View All</Link>
  </div>
  <div class="card-body p-0">
    <Table
      headerSlot={/* ... */}
      bodySlots={recentTransactions.value.map(txn => /* ... */)}
    />
  </div>
</div>
```

## Real-time Updates
- Automatically refreshes when new transactions are added
- Updates immediately via WebSocket connections
- No additional API calls required

## Mobile Considerations
- Responsive table design
- Simplified view on small screens
- Touch-friendly action buttons
- Horizontal scroll for full table data

## Implementation Steps
1. Create computed signal for recent transactions
2. Reuse existing Table component with dashboard-specific styling
3. Implement quick action dropdown menu
4. Add responsive design for mobile devices
5. Integrate with existing transaction management functions

## Integration Points
- Links to full transaction list page
- Uses existing transaction edit/delete operations
- Maintains consistency with transaction list UI patterns
