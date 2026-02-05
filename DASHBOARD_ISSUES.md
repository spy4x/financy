# Dashboard Widget Issues

## Testing Sessions

### Session 1: 2026-01-27 16:16 UTC
- Email: dashboard-test-2026-01-27@financy.dev

### Session 2: 2026-01-27 08:54 UTC (testuser123)
- Username: testuser123  
- Created fresh account
- Found: Transaction form submit requires manual trigger (click event doesn't naturally fire form submit)
- Verified: USD-only transactions work correctly (no decimal bugs detected in simple USD-only scenarios)
- Note: Multi-currency issues documented below from Session 1 still need verification

## Test Plan
1. Create bank accounts (USD, EUR, GBP, JPY)
2. Add transactions one by one (income/expense/transfer, various currencies)
3. Check dashboard widgets for correctness after each transaction
4. Document any numerical inconsistencies

## Issues Found

### Issue #1: JPY Account Starting Balance Multiplied by 100

**When**: Creating JPY account with starting balance
**Trigger**: Created "JPY Account" with starting balance ¥100,000

**Widget**: Multi-Currency Overview, Account Balances, Financial Overview
**Expected Values**:
- JPY Account balance: ¥100,000
- USD equivalent: ~$649 (at rate 1 USD = 154.1537 JPY)
- Total Balance: ~$2,510 (€1,000 ≈ $1,176 + £500 ≈ $685 + ¥100,000 ≈ $649 + $0)

**Actual Values**:
- JPY Account balance: ¥10,000,000 (100x error!)
- USD equivalent: $90,497.70
- Total Balance: $92,359.10 (should be ~$2,510)

**Analysis**: 
JPY has 0 decimal places. System appears to store/parse "100000" as "10000000" (100x multiplier). Likely a decimal place conversion bug in account creation or balance calculation for zero-decimal currencies.

**Files to investigate**:
- `libs/shared/helpers/format.ts` - Currency formatting/parsing
- `libs/shared/helpers/currency-converter.ts` - FX calculations
- `apps/web/src/routes/accounts/create/` - Account creation form
- `apps/api/src/cqrs/commands/account/create-account.command.ts` - Backend account creation

---

### Issue #5: EUR Transaction Displays 100x Too Large

**When**: Creating EUR transaction (2-decimal currency)
**Trigger**: Created Income transaction: €2,000.00 freelance → EUR Account

**Expected Values**:
- Transaction amount: €20.00
- EUR Account balance: €1,020.00 (€1,000 starting + €20 income)
- USD equivalent: ~$23.53 (€20 ÷ 0.8427)

**Actual Values**:
- Transaction amount shown in table: €2,000.00 (100x error!)
- EUR Account balance: €3,000.00 (€1,000 + €2,000)
- Income by Category → Freelance: $2,000.00

**Analysis**:
EUR behavior identical to JPY (Issue #3), confirming systematic bug across currencies:
- **User enters €2000.00** (or $5000, or ¥10000)
- **System displays/stores different values** based on currency decimal places

**Pattern confirmed across all tested currencies:**
- USD (2 decimals): User enters $5000 → Displays $50.00 (**÷100**)
- EUR (2 decimals): User enters €2000 → Displays €2,000.00 (**×100**)
- JPY (0 decimals): User enters ¥10000 → Displays ¥1,000,000 (**×100**)

**Root Cause Hypothesis**:
System likely stores amounts as integers (smallest currency unit: cents for USD/EUR, yen for JPY). Bug appears in conversion between user input string and internal integer storage:
- USD: "5000.00" should → 500000 cents, but displays as 5000 cents (÷100 error in display)
- EUR: "2000.00" should → 200000 cents, but stores as 20000000 cents (×100 error in storage)
- JPY: "10000" should → 10000 yen, but stores as 1000000 yen (×100 error in storage)

**Critical Files to Fix**:
1. `libs/shared/helpers/format.ts` - `parseAmount()` function (likely multiplying/dividing incorrectly)
2. `apps/web/src/components/multi-currency-amount-input.tsx` - Form input parsing
3. `apps/api/src/cqrs/commands/transaction/create-transaction.command.ts` - Backend storage
4. `apps/api/src/cqrs/commands/account/create-account.command.ts` - Account starting balance

---

## Test Results Summary (2026-01-27 Update)

### Unit Tests: ✅ PASSING
- All `format.ts` helper tests pass (parseCurrencyInput, formatCentsToInput)
- Tests cover USD (2 decimals), JPY (0 decimals), BTC (8 decimals), BHD (3 decimals)
- Round-trip conversions work correctly
- **Conclusion**: Core parsing/formatting logic is CORRECT

### Manual Testing: ✅ USD-ONLY WORKS
- Created testuser123 account
- Created $100 expense transaction
- All dashboard widgets calculated correctly:
  - Total Balance: -$100.00 ✓
  - Expenses: -$100.00 ✓
  - Budget Progress: $100/$500 (20%) ✓
  - Account Balances: Checking -$100.00 ✓
- **Conclusion**: USD-only transactions work correctly in production

### E2E Tests: ❌ FAILING (Test Setup Issues)
- Multi-currency E2E tests fail at login step
- Tests try to use email/password fields that don't exist
- Tests need to be updated to match actual auth flow (username/password)
- Tests need data-e2e attributes for reliable selectors

### Root Cause Analysis

**What Works:**
- ✅ Format helpers (unit tests pass)
- ✅ USD-only transactions (manual test confirms)
- ✅ Backend storage (stores values as received)

**What Might Be Broken:**
- ⚠️ Multi-currency account creation (untested after original session)
- ⚠️ Multi-currency transaction creation (untested after original session)  
- ⚠️ Frontend currency input component (not passing correct decimal info to helpers?)
- ⚠️ Dashboard multi-currency display (FX conversion issues?)

**Hypothesis:**
Since format helpers work correctly and USD-only works, bugs likely in:
1. Frontend not passing `decimals` parameter to `parseCurrencyInput()`/`formatCentsToInput()`
2. Currency metadata not being retrieved/used properly in form components
3. Dashboard widgets not using correct decimal places for FX conversions

## Next Steps

**High Priority:**
1. ❌ Fix E2E test auth flow to use username/password
2. ❌ Add data-e2e attributes to transaction/account forms
3. ❌ Run E2E tests to reproduce multi-currency bugs
4. ❌ Find where frontend calls format helpers without passing decimals parameter
5. ❌ Fix frontend to pass correct decimals based on currency
6. ❌ Re-run E2E tests until green
7. ❌ Deploy and verify

**Test Coverage Needed:**
- E2E test: Create JPY account with ¥100,000 starting balance → verify shows ¥100,000 (not ¥10,000,000)
- E2E test: Create USD transaction $5000 → verify shows $5,000.00 (not $50.00)
- E2E test: Create JPY transaction ¥10,000 → verify shows ¥10,000 (not ¥1,000,000)
- E2E test: Create EUR transaction €2000 → verify shows €2,000.00 (not €200,000.00)

---


**When**: Creating JPY transaction (zero-decimal currency)
**Trigger**: Created Expense transaction: ¥10,000 groceries → JPY Account

**Widgets Affected**: All widgets, Transaction table, Account balances

**Expected Values**:
- Transaction amount: -¥10,000
- JPY Account balance: ¥90,000 (started at ¥100,000, spent ¥10,000)
- USD equivalent of expense: ~$64.88 (¥10,000 ÷ 154.1537)

**Actual Values**:
- Transaction amount: -¥1,000,000 (100x error - **multiplied** by 100!)
- JPY Account balance: ¥9,000,000 (¥10,000,000 - ¥1,000,000)
- Transaction shown in table: "-¥1,000,000"

**Analysis**:
**Critical finding**: Different currencies have opposite bugs!
- **USD transactions**: Divided by 100 (Issue #2)
- **JPY transactions**: Multiplied by 100 (this issue)

JPY has 0 decimal places, USD has 2. System appears to incorrectly apply decimal conversion:
- When user enters "10000" for JPY (should be stored as 10000), it's stored as 1000000
- When user enters "5000.00" for USD (should be stored as 5000.00 or 500000 cents), it's displayed as 50.00

**Hypothesis**: System stores all amounts as integers (cents/smallest unit). For JPY (0 decimals), entering "10000" should mean 10000 units, but system multiplies by 100. For USD (2 decimals), entering "5000.00" should mean 500000 cents, but something divides display by 100.

---

### Issue #4: Inconsistent Expense Totals Across Widgets

**When**: After creating JPY expense transaction
**Trigger**: Same transaction as Issue #3

**Widgets with DIFFERENT expense values**:
1. **Financial Overview → Expenses**: -$9,049.77
2. **Monthly Spending Trends → January Expenses**: $10,000.00  
3. **Category Spending Breakdown → Groceries**: $10,000.00
4. **Budget Progress → Groceries spent**: $10,000.00

**Expected**: All widgets should show same expense total

**Analysis**:
At exchange rate 1 USD = 154.1537 JPY:
- ¥1,000,000 (displayed transaction) ÷ 154.1537 = $6,487.74 USD equivalent
- But $9,049.77 and $10,000.00 don't match ¥1,000,000 conversion

Possible causes:
- Financial Overview using different FX conversion logic
- Some widgets converting from original amount, others from displayed amount
- Cache/sync issues between widgets
- Rounding errors compounded with decimal bugs

**Impact**: User sees 3 different expense values ($9,049.77, $10,000, ¥1,000,000) for single transaction, making dashboard unreliable.

---


**When**: Creating transaction with amount
**Trigger**: Created Income transaction: $5,000.00 salary → Checking Account

**Widgets Affected**: ALL dashboard widgets (Financial Overview, Income, Total Balance, Cash Flow, Transactions table, etc.)

**Expected Values**:
- Transaction amount: $5,000.00
- Checking Account balance: $5,000.00
- Total Balance: $97,359.10 (previous $92,359.10 + $5,000)
- Income this month: $5,000.00

**Actual Values**:
- Transaction amount: $50.00 (100x error - divided by 100!)
- Checking Account balance: $50.00
- Total Balance: $92,409.10 (previous $92,359.10 + $50)
- Income this month: $50.00

**Analysis**:
Opposite bug to Issue #1. Transaction amounts are divided by 100 when stored/retrieved. User enters "5000.00" but system stores/displays "50.00". Combined with Issue #1, there's a systematic decimal handling bug across:
- Account starting balances (multiplied by 100, at least for JPY)
- Transaction amounts (divided by 100, for all currencies tested)

**Note**: All downstream calculations are internally consistent (Total Balance math is correct, percentages correct, etc.), but based on wrong base amounts.

**Files to investigate** (same as Issue #1):
- `libs/shared/helpers/format.ts` - parseAmount/formatAmount functions
- `apps/web/src/routes/transactions/create/` - Transaction form parsing
- `apps/api/src/cqrs/commands/transaction/create-transaction.command.ts` - Backend transaction creation
- Database schema - check if amounts stored as integers (cents) vs decimals

---

