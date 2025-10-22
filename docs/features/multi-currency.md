# Multi-Currency Support Feature

## Overview

Multi-currency support allows users to create accounts in different currencies, record transactions in their original currency, and view balances converted to a base currency. This feature is essential for users who manage finances across multiple currencies or countries.

## Status: In Progress

**Current Branch:** `multi-currency`  
**Last Update:** WIP commit (dc8c87d) - July 23, 2025

### Completed Phases

- ✅ **Phase 1: Foundation** - Database schema, migrations, pure currency helpers, exchange rate provider, background workers
- ✅ **Phase 2: API Layer Enhancement** - CQRS commands for multi-currency transactions and transfers, refactored to use pure functions
- ✅ **Phase 3: Frontend Implementation** - State management, multi-currency components, transaction forms, balance displays
- ✅ **Phase 4: UI/UX Enhancements** - Account management, transaction views, dashboard enhancements with MultiCurrencyDashboard
- 🔄 **Phase 5: External API Integration** - Production-ready exchange rate provider with monitoring and fallback

### In Progress

- 🔄 **Phase 5: External API Integration** - API usage tracking, fallback provider, rate validation, notifications

### Not Started

- ❌ **Phase 6: Advanced Features** - Analytics, smart conversion, reporting enhancements

## Architecture Overview

### Database Schema

#### Exchange Rates Table

```sql
CREATE TABLE exchange_rates (
    id SERIAL PRIMARY KEY,
    from_currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    to_currency_id INT4 NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
    rate NUMERIC(18, 8) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    fetched_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT unique_rate_per_day UNIQUE (from_currency_id, to_currency_id, date)
);
```

**Key Points:**
- High-precision rates with NUMERIC(18, 8)
- Daily rate storage with unique constraint
- Tracks when rates were fetched vs created
- Supports soft deletion

#### Transaction Enhancements

Transactions already support multi-currency via:
- `original_currency_id` - Original transaction currency (NULL if same as account currency)
- `original_amount` - Original amount before conversion
- `amount` - Converted amount in account currency

#### Group Base Currency

Groups have `currency_id` as the base currency for reporting and conversions.

### Backend Architecture

#### Pure Currency Helpers (`libs/shared/helpers/currency.ts`)

Core conversion logic using pure functions:

```typescript
// Pure functions that accept exchange rates as parameters
getExchangeRate(rates: ExchangeRate[], from: number, to: number, date?: Date): number | null
convertAmount(amount: number, fromCurrencyId: number, toCurrencyId: number, rates: ExchangeRate[]): number | null
```

**Benefits:**
- No database dependencies
- Easy to test
- Reusable across frontend and backend
- Supports USD-based cross-currency conversion

#### Exchange Rate Provider (`apps/api/services/exchange-rate-provider.ts`)

Simplified rate fetching and storage:

```typescript
class ExchangeRateProvider {
  async fetchAndStoreRates(): Promise<void>
  async getRate(fromCurrencyId: number, toCurrencyId: number, date?: Date): Promise<number | null>
}
```

**Features:**
- Uses exchangerate-api.com (free tier: 1,500 requests/month)
- USD-based conversion strategy
- Error handling with retry logic
- Caches rates in Valkey (Redis)
- Stores historical rates in database

#### Background Workers

**Exchange Rate Fetcher** (`apps/api/workers/exchange-rate-fetcher.ts`):
- Runs daily to fetch updated exchange rates
- Supports all currencies in the database
- Error handling and logging
- Integrates with global sync system

### Frontend Architecture

#### State Management

**Currency State** (`apps/web/src/state/currency.ts`):
```typescript
export const currency = {
  list: Signal<Currency[]>,
  fiatCurrencies: Computed<Currency[]>,
  cryptoCurrencies: Computed<Currency[]>,
  getById(currencyId: number): Currency,
  getByCode(code: string): Currency,
}
```

**Exchange Rate State** (`apps/web/src/state/exchange-rate.ts`):
```typescript
export const exchangeRate = {
  list: Signal<ExchangeRate[]>,
  getAll(): ExchangeRate[],
}
```

Both integrate with WebSocket for real-time updates.

#### UI Components

**MultiCurrencyAmountInput** (`apps/web/src/components/ui/MultiCurrencyAmountInput.tsx`):
- Combined amount input with currency selector
- Real-time conversion preview
- Shows exchange rates used
- Supports both account and transaction currencies

**MultiCurrencyAccountBalance** (`apps/web/src/components/ui/MultiCurrencyAccountBalance.tsx`):
- Display account balance in native currency
- Show converted value in group base currency
- Summary component for total balance across accounts
- Percentage breakdown by currency

**TransferForm** (`apps/web/src/components/TransferForm.tsx`):
- Specialized form for cross-currency transfers
- Account selection with currency display
- Exchange rate display with manual override
- Real-time conversion preview

**MultiCurrencyDashboard** (`apps/web/src/components/MultiCurrencyDashboard.tsx`):
- Total balance across all currencies
- Currency diversity metrics
- Currency breakdown with percentages
- Recent cross-currency transactions

## Implementation Details

### Currency Conversion Flow

1. **Transaction Creation:**
   - User selects transaction currency (defaults to account currency)
   - If different from account currency, original amount is stored
   - Backend converts using latest exchange rate
   - Both original and converted amounts are saved

2. **Cross-Currency Transfer:**
   - User selects source and target accounts
   - System fetches exchange rate between currencies
   - Shows conversion preview with rate
   - Creates two linked transactions with proper amounts

3. **Balance Display:**
   - Account balance calculated in account's native currency
   - Converted to group base currency for display
   - Total balance aggregates across all accounts
   - Shows currency breakdown

### Exchange Rate Strategy

**USD as Base Currency:**
All exchange rates are stored relative to USD, enabling efficient conversions:

```
EUR -> JPY conversion:
1. Get EUR/USD rate
2. Get JPY/USD rate  
3. Calculate: amount * (EUR/USD) / (JPY/USD)
```

This approach:
- Reduces database storage (N currencies need N-1 rate pairs, not N*(N-1))
- Simplifies rate fetching from external APIs
- Maintains accuracy through direct API rates

### Data Integrity

- **Original amounts preserved:** Never lose the original transaction currency/amount
- **Audit trail:** `fetched_at` tracks when rates were updated
- **Validation:** Exchange rates validated before storage
- **Fallback:** Last known rate used if new fetch fails

## Current Known Issues

### Fixed Issues

✅ **Transaction List Import Error** - Missing import for `currency` and `account` modules
- **Impact:** Currency filter in transaction list causes "currency is not defined" error
- **Status:** Fixed
- **Fix:** Add proper imports to transaction list component

## Phase 4 Completion Tasks

### 4.1 Account Management (✅ Complete)

- ✅ Currency selection during account creation
- ✅ Currency change warnings (existing transactions)
- ✅ Currency-specific formatting and symbols

### 4.2 Transaction Views (✅ Complete)

- ✅ Currency filter in transaction list
- ✅ Original amount display in transaction table
- ✅ Currency conversion indicators (blue circular arrow icon)
- ✅ Exchange rate display in transaction forms

### 4.3 Dashboard Enhancements (✅ Complete)

- ✅ Multi-currency balance components created
- ✅ MultiCurrencyDashboard integrated into main dashboard
- ✅ Currency diversity metrics
- ✅ Balance breakdown by currency
- ✅ Exchange rate display widget

### 4.4 Settings & Preferences (✅ Complete)

- ✅ Group base currency selection in group editor
- ✅ Currency-aware account management

## Phase 5: External API Integration (🔄 In Progress)

### 5.1 API Monitoring and Usage Tracking (✅ Complete)

**Database Schema:**
- `exchange_rate_api_usage` table tracks all API requests
- Stores provider, endpoint, success/failure, response time, errors
- Enables usage analytics and rate limit monitoring

**Implementation:**
- Automatic tracking of all API calls with timing metrics
- Error message capture for debugging
- Provider-specific usage statistics
- `getApiUsageStats()` method for analytics

### 5.2 Fallback Provider (✅ Complete)

**Primary Provider: exchangerate-api.com**
- Free tier: 1,500 requests/month
- 168 currencies supported
- Historical rates available
- 10-second timeout for reliability

**Backup Provider: fixer.io**
- Free tier: 100 requests/month
- 170+ currencies supported
- Automatic failover when primary fails
- Independent rate limiting

**Failover Strategy:**
1. Try primary provider with exponential backoff retry (3 attempts)
2. On failure, automatically switch to fallback provider
3. Log all provider switches for monitoring
4. Track success rates per provider

### 5.3 Retry Logic and Error Handling (✅ Complete)

**Exponential Backoff:**
- 3 retry attempts for primary provider
- Delay: 2s, 4s, 8s between retries
- Prevents API throttling issues

**Error Handling:**
- Graceful degradation to last known rates
- Detailed error logging with context
- API usage tracking even on failures
- Clear error messages for debugging

### 5.4 Rate Validation and Anomaly Detection (✅ Complete)

**Validation Rules:**
- Rate must be positive number
- Maximum threshold: 1,000,000 (sanity check)
- No NaN or infinite values
- Type checking for numeric values

**Change Detection:**
- Minor alert: >2% change
- Significant alert: >5% change
- Major alert: >10% change
- Historical comparison on each fetch
- Alert storage in `exchange_rate_alerts` table

### 5.5 Manual Rate Override (✅ Complete)

**Database Schema:**
- `exchange_rate_overrides` table for admin-set rates
- Includes reason, validity period, audit trail
- `overridden_by` tracks which admin set the override
- Optional expiration date for temporary overrides

**Use Cases:**
- Emergency rate fixing when APIs fail
- Regulatory compliance requirements
- Special exchange agreements
- API rate anomalies

**Implementation:**
- Checked before storing API-fetched rates
- Logs when override is active
- Time-based validity (start/end dates)
- Soft delete support for audit trail

### 5.6 Rate Change Notifications (🔄 Partially Complete)

**Alert System:**
- ✅ Alert creation in database
- ✅ Percentage change calculation
- ✅ Alert type classification (minor/significant/major)
- ❌ Push notification delivery (TODO)
- ❌ Email notifications (TODO)
- ❌ User notification preferences (TODO)

**Next Steps:**
- Integrate with existing push notification system
- Add user preferences for alert thresholds
- Create notification templates
- Add notification history view

### 5.7 Admin Dashboard (❌ Not Started)

**Planned Features:**
- View API usage statistics per provider
- Monitor success/failure rates
- See rate change history and alerts
- Manually trigger rate fetches
- Set manual rate overrides
- View and manage alert notifications

## Phase 4 Completion Tasks

### 4.1 Account Management (Completed in editor.tsx)

- ✅ Currency selection during account creation
- ⚠️ Currency change warnings (existing transactions) - Need UI enhancement
- ✅ Currency-specific formatting and symbols

### 4.2 Transaction Views (Partially Complete)

- ✅ Currency filter in transaction list
- ⚠️ Original amount display in transaction table - Need to show if different from account currency
- ❌ Exchange rate used in transaction details
- ❌ Better visual indicator for cross-currency transactions

### 4.3 Dashboard Enhancements (Components Exist, Need Integration)

- ✅ Multi-currency balance components created
- ❌ Integrate MultiCurrencyDashboard into main dashboard
- ❌ Currency conversion widget
- ❌ Exchange rate trends chart
- ❌ Base currency preference setting in user settings

### 4.4 Settings & Preferences (Not Started)

- ❌ Group base currency selection UI
- ❌ Currency management (enable/disable specific currencies)
- ❌ Exchange rate provider settings
- ❌ Conversion preferences (rounding, display format)

## Testing Strategy

### Unit Tests

- Pure currency conversion functions
- Exchange rate provider logic
- Edge cases (missing rates, invalid currencies)

### Integration Tests

- Transaction creation with currency conversion
- Cross-currency transfers
- Balance calculations across currencies

### E2E Tests

- Create accounts in different currencies
- Record transactions in various currencies
- Transfer between accounts with different currencies
- Verify balance displays and conversions
- Test currency filter in transaction list

## External APIs

### Primary Provider: exchangerate-api.com

**Free Tier:**
- 1,500 requests/month
- 168 currencies supported
- Historical rates available
- Simple REST API

**Implementation:**
```typescript
// Example API call
GET https://v6.exchangerate-api.com/v6/{API_KEY}/latest/USD

Response:
{
  "result": "success",
  "base_code": "USD",
  "conversion_rates": {
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 149.50,
    ...
  }
}
```

### Future Considerations

**Backup Provider: fixer.io**
- 100 requests/month free
- 170+ currencies
- Historical data support

**Rate Limiting Strategy:**
- Cache rates in Valkey for 1 hour
- Store historical rates in database
- Fetch once daily (background worker)
- Manual refresh option for admins

## Security Considerations

1. **Validation:** All currency inputs validated against database
2. **Rate Limits:** API key usage monitored
3. **Audit Trail:** All conversions logged
4. **Fallback:** Manual rate entry for emergency situations

## Performance Optimization

1. **Caching:** Exchange rates cached in Valkey (1 hour TTL)
2. **Database Indexes:** Optimized for currency lookups
3. **Batch Processing:** Bulk conversions processed efficiently
4. **Rate Limiting:** External API calls throttled

## Migration & Backward Compatibility

### Data Migration

Existing data remains unchanged:
- Single-currency accounts continue to work
- No disruption to existing transactions
- Gradual adoption of multi-currency features

### Migration SQL

```sql
-- Populate missing currency data for existing accounts
UPDATE accounts SET currency_id = (
  SELECT currency_id FROM groups WHERE groups.id = accounts.group_id
) WHERE currency_id IS NULL;
```

## Success Metrics

### Technical Metrics

- ✅ Exchange rate provider integrated
- ✅ Currency conversion accuracy tested
- ⚠️ Performance impact measured (need benchmarks)
- ⚠️ Test coverage target: 90% (need to create tests)

### User Experience Metrics

- Adoption rate of multi-currency accounts
- Cross-currency transaction volume
- User feedback on currency features
- Support ticket trends

## Next Steps

### Immediate Tasks (Complete Phase 4)

1. **Fix Import Error** ✅ - Add missing imports to transaction list
2. **Test Currency Filter** - Verify filter works correctly
3. **Enhance Transaction Table** - Show original amounts when different from account currency
4. **Dashboard Integration** - Add MultiCurrencyDashboard to main dashboard
5. **Settings UI** - Add group base currency selection

### Short-term Tasks (Phase 5)

1. Finalize exchange rate provider integration
2. Add manual rate override capability
3. Implement rate change notifications
4. Add currency management UI

### Long-term Tasks (Phase 6)

1. Currency analytics and trends
2. Exchange gain/loss tracking
3. Advanced reporting features
4. Tax reporting considerations

## References

- [MULTI_CURRENCIES_FEATURE.md](../../MULTI_CURRENCIES_FEATURE.md) - Original detailed implementation plan
- [schema.sql](../../libs/server/db/schema.sql) - Database schema
- [currency.ts](../../libs/shared/helpers/currency.ts) - Pure conversion functions
- [exchange-rate-provider.ts](../../apps/api/services/exchange-rate-provider.ts) - Rate fetching service
