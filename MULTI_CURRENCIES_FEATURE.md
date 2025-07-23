# Multi-Currency Support Feature Plan

## Overview

This document outlines the comprehensive implementation plan for multi-currency support in Financy. The feature will allow users to:

- Create accounts in different currencies
- Record transactions in their original currency
- Transfer money between accounts with different currencies
- View balances converted to a base currency
- Track exchange rates and conversions
- Maintain audit trails of original amounts

## Database Schema Changes

### 1. Exchange Rates Table (Already Exists - Needs Enhancement)

Current schema is good but needs optimization:

```sql
-- Enhance existing exchange_rates table
ALTER TABLE exchange_rates 
DROP COLUMN pair,
ADD COLUMN from_currency_id INT4 NOT NULL REFERENCES currencies(id),
ADD COLUMN to_currency_id INT4 NOT NULL REFERENCES currencies(id),
ADD COLUMN date DATE NOT NULL DEFAULT CURRENT_DATE,
ADD CONSTRAINT unique_rate_per_day UNIQUE (from_currency_id, to_currency_id, date);

-- Update rate column to use NUMERIC for precision
ALTER TABLE exchange_rates ALTER COLUMN rate TYPE NUMERIC(18, 8);
```

### 2. Transaction Enhancements (Partially Implemented)

The current schema already supports original currency:

- `original_currency_id` - stores the original transaction currency
- `original_amount` - stores the original amount
- `amount` - stores converted amount in account currency

### 3. Group Base Currency

Groups already have `currency_id` which serves as the base currency for reporting.

### 4. New Indexes for Performance

```sql
-- Optimize exchange rate lookups
CREATE INDEX idx_exchange_rates_lookup ON exchange_rates (from_currency_id, to_currency_id, date DESC);
CREATE INDEX idx_exchange_rates_date ON exchange_rates (date DESC);

-- Optimize currency conversions in transactions
CREATE INDEX idx_transactions_original_currency ON transactions (original_currency_id) WHERE original_currency_id IS NOT NULL;
```

## Implementation Strategy

### ✅ Phase 1: Foundation (Database & Core Services) - COMPLETED

#### ✅ 1.1 Database Migration

- [x] Create migration to enhance exchange_rates table
- [x] Add performance indexes
- [x] Populate initial currency data (major fiat + crypto)
- [x] Update schema.sql documentation

#### ✅ 1.2 Pure Currency Helpers (`libs/shared/helpers/currency.ts`)

- [x] Implement pure conversion functions without database dependencies
- [x] Functions accept `exchangeRates: ExchangeRate[]` parameter
- [x] Add `getExchangeRate()` and `convertAmount()` pure functions
- [x] Add cross-currency conversion with USD as base currency
- [x] Add robust fallback currency ID detection

#### ✅ 1.3 Exchange Rate Provider (`apps/api/services/exchange-rate-provider.ts`)

- [x] Implement simplified rate fetching and storage
- [x] Add USD-based conversion strategy (exchangerate-api.com)
- [x] Add error handling and basic retry logic
- [x] Remove complex service layer - keep simple fetch/store pattern

#### ✅ 1.4 Background Workers

- [x] Create exchange rate fetcher worker
- [x] Add scheduled job to fetch daily rates
- [x] Add error handling and retry logic

#### ✅ 1.5 Database Integration

- [x] Add exchange rate sync integration with global data system
- [x] Add database service methods for exchange rate CRUD operations
- [x] Add cache support for exchange rate data
- [x] Add type definitions and schema validation

#### ✅ 1.6 Updated Transaction Handlers

- [x] Update account transfer handler to use pure conversion functions
- [x] Add multi-currency transfer support
- [x] Add proper error handling for missing exchange rates

> **Architecture Decision**: Refactored from complex service-oriented approach to pure function approach. Removed CurrencyService and CQRS queries to focus on simple fetch/store with pure conversion helpers. This provides better testability and fewer dependencies.

### ✅ Phase 2: API Layer Enhancement - PARTIALLY REFACTORED

#### ✅ 2.1 CQRS Commands Enhancement

- [x] **TransactionCreateCommand** - Already supports multi-currency with originalCurrencyId and originalAmount
- [x] **AccountTransferCommand** - Enhanced to handle cross-currency transfers with exchange rate support

#### ❌ 2.2 CQRS Query Handlers - REMOVED

- ~~**GetExchangeRatesQuery**~~ - Removed in favor of sync system integration
- ~~**GetCurrenciesQuery**~~ - Removed in favor of sync system integration
- ~~**GetAccountBalanceQuery**~~ - Enhanced conversion moved to pure helpers

#### ✅ 2.3 Background Workers

- [x] **Exchange Rate Fetcher** - Implemented background worker for daily rate updates

> **Refactoring Note**: Removed CQRS query handlers for currencies and exchange rates. These are now handled by the global sync system and pure helper functions. This simplifies the architecture and reduces complexity.

### ✅ Phase 3: Frontend Implementation - COMPLETED

#### ✅ 3.1 Frontend State Management & Multi-Currency Components

**Exchange Rate State** (`apps/web/src/state/exchange-rate.ts`):

- ✅ WebSocket integration for real-time exchange rate updates
- ✅ Signal-based state management with getAll() method
- ✅ Integration with global sync system

**MultiCurrencyAmountInput** (`apps/web/src/components/ui/MultiCurrencyAmountInput.tsx`):

- ✅ Combined amount input with currency selection
- ✅ Real-time conversion preview with exchange rates
- ✅ Support for cross-currency transactions

**MultiCurrencyAccountBalance** (`apps/web/src/components/ui/MultiCurrencyAccountBalance.tsx`):

- ✅ Account balance display with multi-currency support
- ✅ Conversion to group's base currency
- ✅ AccountBalanceSummary for total balance across accounts

**Integration**:

- ✅ State initialization updated with exchange rate support
- ✅ Pure function integration with shared currency helpers
- ✅ Real-time updates via WebSocket and sync system

#### ✅ 3.2 Transaction Forms Enhancement - COMPLETED

**TransactionForm** enhancements (`apps/web/src/routes/transactions/editor.tsx`):

- ✅ Enhanced amount input with MultiCurrencyAmountInput component
- ✅ Cross-currency transaction support with real-time conversion preview
- ✅ Original currency selection with automatic conversion handling
- ✅ Transfer-specific UI with proper currency pair display

**TransferForm** component (`apps/web/src/components/TransferForm.tsx`):

- ✅ Specialized form for cross-currency account transfers
- ✅ Account selection with currency display
- ✅ Exchange rate display with manual override option
- ✅ Real-time conversion preview and validation

#### ✅ 3.3 Balance Display Components - COMPLETED

**AccountBalanceWidget** and **GroupBalanceOverview** (`apps/web/src/components/BalanceWidgets.tsx`):

- ✅ Account balance display with multi-currency support
- ✅ Conversion to group base currency with trend indicators
- ✅ AccountBalanceSummary for total balance across accounts with currency breakdown
- ✅ Responsive design with proper formatting

**MultiCurrencyDashboard** (`apps/web/src/components/MultiCurrencyDashboard.tsx`):

- ✅ Comprehensive dashboard with multi-currency insights
- ✅ Total balance across all currencies with diversity metrics
- ✅ Currency breakdown with percentages and account distribution
- ✅ Recent cross-currency transactions display

### Phase 4: UI/UX Enhancements

#### 4.1 Account Management

- [ ] Currency selection during account creation
- [ ] Currency change warnings (existing transactions)
- [ ] Currency-specific formatting and symbols

#### 4.2 Transaction Views

- [ ] Original amount display in transaction lists
- [ ] Currency conversion indicators
- [ ] Exchange rate used in transaction details
- [ ] Filter transactions by currency

#### 4.3 Dashboard Enhancements

- [ ] Multi-currency balance cards
- [ ] Currency conversion widget
- [ ] Exchange rate trends
- [ ] Base currency preference setting

#### 4.4 Settings & Preferences

- [ ] Group base currency selection
- [ ] Currency management (add/remove)
- [ ] Exchange rate provider settings
- [ ] Conversion preferences

### Phase 5: External API Integration

#### 5.1 Free Exchange Rate APIs

**Primary: exchangerate-api.com (Free tier)**

- 1,500 requests/month free
- 168 currencies supported
- Historical rates available
- Simple REST API

**Backup: fixer.io (Free tier)**

- 100 requests/month free
- 170+ currencies
- Historical data
- JSON response format

**Implementation Strategy:**

```typescript
interface ExchangeRateProvider {
  name: string
  fetchRates(baseCurrency: string, targetCurrencies: string[]): Promise<ExchangeRateResponse>
  fetchHistoricalRate(from: string, to: string, date: Date): Promise<number>
  getRateLimit(): RateLimit
}

// USD-based conversion strategy
class USDBasedConverter {
  async convert(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
    if (fromCurrency === "USD") {
      return amount * await this.getUSDRate(toCurrency)
    } else if (toCurrency === "USD") {
      return amount / await this.getUSDRate(fromCurrency)
    } else {
      // Convert through USD: FROM -> USD -> TO
      const usdAmount = amount / await this.getUSDRate(fromCurrency)
      return usdAmount * await this.getUSDRate(toCurrency)
    }
  }
}
```

#### 5.2 Rate Caching Strategy

- Cache rates in Valkey (Redis) for 1 hour
- Database storage for historical rates
- Fallback to last known rate if API fails
- Rate validation (reject obvious anomalies)

### Phase 6: Advanced Features

#### 6.1 Currency Analytics

- [ ] Exchange rate trend charts
- [ ] Currency exposure analysis
- [ ] Conversion cost tracking
- [ ] Best/worst performing currencies

#### 6.2 Smart Conversion

- [ ] Automatic rate suggestions
- [ ] Conversion fee tracking
- [ ] Rate alerts and notifications
- [ ] Bulk currency conversion tools

#### 6.3 Reporting Enhancements

- [ ] Multi-currency financial reports
- [ ] Currency-specific spending analysis
- [ ] Exchange gain/loss reporting
- [ ] Tax reporting considerations

## Technical Considerations

### 1. Data Integrity

- Always preserve original transaction amounts
- Audit trail for all currency conversions
- Validation of exchange rates before storage
- Transaction rollback on conversion failures

### 2. Performance Optimization

- Efficient caching of exchange rates
- Batch processing for bulk conversions
- Database query optimization for currency lookups
- Rate limiting for external API calls

### 3. Error Handling

- Graceful degradation when rates unavailable
- Fallback to manual rate entry
- Clear error messages for currency issues
- Retry mechanisms for API failures

### 4. Security

- Validate all currency inputs
- Rate-limit currency conversion requests
- Audit currency preference changes
- Secure API key management

### 5. Testing Strategy

- Unit tests for currency conversion logic
- Integration tests for API providers
- E2E tests for multi-currency workflows
- Performance tests for rate fetching
- Edge case testing (missing rates, API failures)

## Migration Strategy

### 1. Backward Compatibility

- Existing single-currency data remains unchanged
- Gradual migration to multi-currency features
- Default to group base currency for existing accounts
- Preserve all historical transaction data

### 2. Data Migration

```sql
-- Populate missing currency data
UPDATE accounts SET currency_id = (
  SELECT currency_id FROM groups WHERE groups.id = accounts.group_id
) WHERE currency_id IS NULL;

-- Set original currency for existing transactions
UPDATE transactions SET 
  original_currency_id = (SELECT currency_id FROM accounts WHERE accounts.id = transactions.account_id),
  original_amount = amount
WHERE original_currency_id IS NULL;
```

### 3. Feature Rollout

1. **Phase 1**: Database and backend (no UI changes)
2. **Phase 2**: Admin currency management
3. **Phase 3**: Account currency selection
4. **Phase 4**: Transaction currency support
5. **Phase 5**: Full multi-currency dashboard

## Success Metrics

### 1. Technical Metrics

- [ ] Exchange rate API uptime > 99.5%
- [ ] Currency conversion accuracy
- [ ] Performance impact < 10% on existing features
- [ ] Test coverage > 90% for currency features

### 2. User Experience Metrics

- [ ] Multi-currency adoption rate
- [ ] Transaction completion rate with currency conversion
- [ ] User satisfaction with currency features
- [ ] Support ticket reduction for currency issues

## Timeline Estimate

- **Phase 1 (Foundation)**: 2-3 weeks
- **Phase 2 (API Layer)**: 2-3 weeks
- **Phase 3 (Frontend)**: 3-4 weeks
- **Phase 4 (UI/UX)**: 2-3 weeks
- **Phase 5 (External APIs)**: 1-2 weeks
- **Phase 6 (Advanced)**: 2-3 weeks

**Total**: ~12-18 weeks for complete implementation

## Risk Assessment

### High Risk

- External API rate limits and reliability
- Complex currency conversion logic bugs
- Performance impact on existing features
- Data migration complexity

### Medium Risk

- User confusion with multi-currency UI
- Exchange rate accuracy and freshness
- Cross-currency transfer accounting

### Low Risk

- Currency selection and display
- Basic conversion calculations
- Settings and preferences

## Conclusion

This multi-currency feature represents a significant enhancement to Financy's capabilities. The phased approach ensures minimal disruption to existing functionality while providing a robust foundation for international users. The USD-based conversion strategy and focus on free APIs keeps operational costs low while maintaining feature richness.

Key success factors:

1. Preserve data integrity throughout migration
2. Maintain high performance with efficient caching
3. Provide intuitive UI for complex currency operations
4. Ensure robust error handling and fallbacks
5. Comprehensive testing across all currency scenarios
