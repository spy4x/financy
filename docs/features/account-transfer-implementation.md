# Account Transfer Implementation

## Overview

Added account-to-account transfer functionality to the Financy application, following the existing CQRS patterns. Transfers create two linked TRANSFER transactions with proper cross-linking and update both account balances atomically.

## Architecture Overview

### Transfer Model

The transfer implementation uses a **single account field architecture**:
- Each transaction has one `accountId` field (the account it belongs to)
- Transfers create **two linked transactions** via `linkedTransactionId`
- No separate "from/to" account fields - transfers are represented by transaction pairs

### Transfer Transaction Pair

When transferring money from Account A to Account B:

1. **Transaction 1** (Source Account):
   - `accountId`: Account A
   - `amount`: -100 (negative = money out)
   - `type`: TRANSFER
   - `linkedTransactionId`: points to Transaction 2

2. **Transaction 2** (Destination Account):
   - `accountId`: Account B  
   - `amount`: +100 (positive = money in)
   - `type`: TRANSFER
   - `linkedTransactionId`: points to Transaction 1

## Features Implemented

### Backend (API)

1. **CQRS Command & Event System**
   - `AccountTransferCommand` - Command to initiate transfer
   - `AccountTransferEvent` - Event emitted after successful transfer
   - `AccountTransferHandler` - Handles transfer logic atomically

2. **WebSocket Support**
   - `WebSocketMessageType.TRANSFER` - New message type for transfers
   - Real-time notifications for all affected parties
   - Error handling and validation

3. **Database Schema**
   - Single `account_id` field per transaction (simplified from previous from/to model)
   - `linked_transaction_id` for connecting transfer pairs
   - `transfer_logic_check` constraint: transfers must have no category

### Frontend (Web)

1. **Account State Integration**
   - `account.transfer()` method for initiating transfers
   - Follows existing WebSocket request patterns

2. **Real-time Updates**
   - Transfer events update both accounts and transactions in real-time
   - Uses existing WebSocket message handling

3. **Smart Transfer Display**
   - UI determines transfer direction by checking transaction amount sign
   - Finds linked transaction to show "other account" in transfers
   - Displays as "Account A → Account B" based on transaction perspective

## Technical Details

### Database Transactions

The transfer is handled atomically within a database transaction:

1. **Validation**
   - Verify both accounts exist and user has access
   - Check that accounts belong to the same group
   - Ensure transfer amount is positive

2. **Transaction Creation (Two-Phase)**
   - **Phase 1**: Create first TRANSFER transaction with `linkedTransactionId: null`
   - **Phase 2**: Create second TRANSFER transaction, linking back to first
   - **Phase 3**: Update first transaction to link to second (bidirectional linking)

3. **Balance Updates**
   - Update source account balance (subtract amount)
   - Update destination account balance (add amount)

### CQRS Flow

```
User Request (WebSocket) 
  → AccountTransferCommand 
  → AccountTransferHandler 
  → Database Transaction 
  → AccountTransferEvent 
  → WebSocket Notifications
```

### Database Constraints

```sql
-- Ensures transfer transactions have no category and regular transactions do
CONSTRAINT transfer_logic_check CHECK (
    (type = 3 AND category_id IS NULL) OR
    (type IN (1, 2) AND category_id IS NOT NULL)
)
```

### WebSocket Message Format

```typescript
// Transfer request
{
  e: "account",
  t: "transfer",
  p: [{
    fromAccountId: number,
    toAccountId: number,
    amount: number,        // In smallest currency unit (cents)
    memo?: string
  }]
}
```

## Security & Validation

- **Multi-tenancy**: All operations are scoped to user's accessible groups
- **Access Control**: Validates user has access to both accounts
- **Amount Validation**: Ensures positive transfer amounts
- **Data Integrity**: Uses database transactions for atomicity

## Usage Examples

### Frontend Usage

```typescript
// Transfer $100 from account 1 to account 2
account.transfer(1, 2, 10000, "Monthly savings transfer")
```

### WebSocket Request

```typescript
ws.request({
  message: {
    e: "account",
    t: WebSocketMessageType.TRANSFER,
    p: [{
      fromAccountId: 1,
      toAccountId: 2,
      amount: 10000,
      memo: "Monthly savings transfer"
    }]
  }
})
```

## Files Modified

### Backend
- `libs/shared/types/+index.ts` - Updated transaction schema to use single `accountId`
- `apps/api/cqrs/commands.ts` - Added AccountTransferCommand
- `apps/api/cqrs/events.ts` - Added AccountTransferEvent
- `apps/api/cqrs/command-handlers/account-transfer.ts` - Transfer handler with linked transactions
- `apps/api/cqrs/event-handlers/websocket-notify-on-account-transfer.ts` - Event handler
- `apps/api/cqrs/+init.ts` - Registered new handlers
- `apps/api/services/websockets.ts` - Added TRANSFER message handling
- `apps/api/services/db.ts` - Updated to use single `accountId` field

### Frontend
- `apps/web/src/state/account.ts` - Added transfer method
- `apps/web/src/state/transaction.ts` - Updated to use single `accountId`
- `apps/web/src/routes/transactions/list.tsx` - Smart transfer display logic
- `apps/web/src/routes/transactions/editor.tsx` - Updated for single account field
- `apps/web/src/routes/dashboard/components/recent-transactions-list.tsx` - Updated display

### Database
- `libs/server/db/migrations/2025_06_29_2130_revert_split_account_fields.sql` - Reverted to single `account_id`
- `libs/server/db/migrations/2025_06_29_2200_fix_transfer_constraint.sql` - Fixed transfer constraint
- `libs/server/db/schema.sql` - Updated to reflect current schema

## Architecture Benefits

### Simplified Model
- ✅ **Single account field** - every transaction belongs to exactly one account
- ✅ **Consistent data model** - no nullable "to_account_id" causing complexity
- ✅ **Cleaner TypeScript types** - no optional fields causing type issues
- ✅ **Simplified UI logic** - no confusing "From/To" account filters

### Transfer Functionality Preserved
- ✅ **Proper linking** - transfers maintain relationships via `linkedTransactionId`
- ✅ **Balance integrity** - atomic updates to both accounts
- ✅ **Smart display** - UI shows transfer direction intelligently
- ✅ **Full audit trail** - both sides of transfer are tracked

## Future Enhancements

1. **Transfer UI**: Create a dedicated transfer interface
2. **Transfer History**: Enhanced filtering for transfer transactions
3. **Scheduled Transfers**: Recurring transfer functionality
4. **Multi-Currency Transfers**: Support transfers between different currencies
5. **Transfer Limits**: Configurable daily/monthly transfer limits
6. **Transfer Fees**: Support for transfer fees/charges

## Testing

All code quality checks pass:
- ✅ TypeScript compilation
- ✅ Linting rules
- ✅ Code formatting
- ✅ Existing tests continue to pass
- ✅ Transfer constraint fixed and working

The implementation maintains backward compatibility and follows all existing patterns in the codebase.
