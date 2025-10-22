# Financy Seed Data Script

This script creates comprehensive test data for the Financy application to enable thorough testing of UI and API functionality.

## What it creates

The seed script generates:

- **Test User**: `test@test.com` / `pass1234`
- **2 Groups**: Personal Finances (USD), Business Expenses (EUR)
- **5 Accounts**: Checking/Savings in USD, Business in EUR, BTC/ETH wallets (in Personal group)
- **6 Categories**: Food, Transport, Travel, Salary, Office Supplies, Mining Rewards
- **Historical Exchange Rates**: 30 days of rates for USD↔EUR, USD↔GBP, USD↔AUD, USD↔NZD, USD↔BTC, USD↔ETH
- **15+ Transactions**: Expenses, income, transfers, multi-currency transactions, travel expenses
- **Tags**: Vacation, Australia, New Zealand, Business, Urgent (associated with transactions)
- **User Settings & Sessions**: Complete authentication setup

## Usage

### Prerequisites

1. Ensure the database is running and migrations are applied:
   ```bash
   deno task compose up -d
   ```

2. Wait for the database to be ready (check logs if needed)

### Running the Script

Execute the seed script:

```bash
deno run --allow-net --allow-env --allow-read infra/scripts/seed-data.ts
```

### Expected Output

```
🌱 Starting Financy seed data creation...
Creating test user...
Creating currencies...
Creating historical exchange rates...
Creating groups...
Creating accounts...
Creating categories...
Creating tags...
Creating transactions...
✅ Seed data created successfully!
Test user: test@test.com
Password: pass1234
Session token: [generated-token]
Groups created: Personal Finances, Business Expenses
Total transactions: 15+
```

## Testing the Data

### API Testing

Use the generated session token for API authentication:

```bash
curl -H "Authorization: Bearer [session-token]" \
     http://localhost:8000/api/groups
```

### UI Testing

1. Start the development server:
   ```bash
   deno task dev
   ```

2. Open `http://fn.localhost` in your browser

3. Sign in with:
   - Email: `test@test.com`
   - Password: `pass1234`

4. Test various features:
   - Switch between groups (Personal, Business)
   - View transactions in different currencies
   - Check account balances
   - Test transfer functionality
   - Verify exchange rate conversions
   - Check category spending limits
   - Test travel expense tracking (Australia/NZ trips)

### Playwright E2E Testing

The test data is designed to work with Playwright tests:

```typescript
// In e2e tests, use the test credentials
await page.fill('[data-e2e="email-input"]', "test@test.com")
await page.fill('[data-e2e="password-input"]', "pass1234")
await page.click('[data-e2e="sign-in-button"]')
```

## Data Coverage

### Currencies
- USD (US Dollar) - Fiat
- EUR (Euro) - Fiat
- GBP (British Pound) - Fiat
- AUD (Australian Dollar) - Fiat
- NZD (New Zealand Dollar) - Fiat
- BTC (Bitcoin) - Crypto
- ETH (Ethereum) - Crypto

### Transaction Types
- **Expenses**: Food, transportation, office supplies, travel
- **Income**: Salary, mining rewards
- **Transfers**: Between accounts (checking ↔ savings)
- **Multi-currency**: EUR expense, AUD travel, NZD travel (all from USD account)

### Travel Expense Scenarios
- **Australia Trip**: Flight (A$1,300) and hotel (A$575) in Sydney
- **New Zealand Trip**: Flight (NZ$1,540) and activities (NZ$480) in Queenstown
- Tests multi-currency conversion display and calculations

### Features Covered
- ✅ Multi-currency support (7 currencies)
- ✅ Group collaboration (different roles)
- ✅ Account transfers
- ✅ Category limits
- ✅ Transaction tagging
- ✅ Historical exchange rates (180 rates total)
- ✅ User authentication
- ✅ Real-time sync data
- ✅ Travel expense tracking across countries
- ✅ Crypto wallet management in personal finances

## Troubleshooting

### Database Connection Issues
Ensure the database is running:
```bash
deno task compose ps
```

### Duplicate Data
The script doesn't check for existing data. To start fresh:
```bash
deno task compose down
sudo rm -rf .volumes
deno task dev
```

Then re-run the seed script.

### Permission Errors
Make sure you're running with proper Deno permissions:
```bash
deno run --allow-net --allow-env --allow-read infra/scripts/seed-data.ts
```

## Customization

To modify the seed data, edit `infra/scripts/seed-data.ts`:

- Change test credentials at the top
- Add more transactions, accounts, or groups
- Modify exchange rate ranges
- Add more tags or categories

The script uses database transactions, so it will either succeed completely or fail safely.