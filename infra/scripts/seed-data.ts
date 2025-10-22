#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

// Financy Seed Data Script
// Run with: deno run --allow-net --allow-env --allow-read infra/scripts/seed-data.ts

// Load environment variables from .env file first - this must happen before any imports
const envFilePath = `./infra/envs/.env`;
const envContent = Deno.readTextFileSync(envFilePath);
const envVars = Object.fromEntries(
  envContent.split("\n")
    .filter(line => line.trim() && !line.startsWith("#"))
    .map((line) => line.split("=").map((part) => part.trim())),
);

// Set environment variables
for (const [key, value] of Object.entries(envVars)) {
  if (value !== undefined) {
    console.log(`Set ENV: ${key}=${value}`);
    Deno.env.set(key, value);
  }
}

// Explicitly set ENV if not set (for safety)
if (!Deno.env.get("ENV")) {
  Deno.env.set("ENV", "dev");
}
Deno.env.set("KV_HOSTNAME", "localhost")
Deno.env.set("DB_HOST", "localhost")

// Import dependencies after env vars are set
import { hash } from "../../libs/shared/helpers/hash.ts"
import {
  UserRole,
  UserMFAStatus,
  UserKeyKind,
  UserSessionStatus,
  SessionMFAStatus,
  CurrencyType,
  Theme,
  GroupRole,
  TransactionDirection,
  TransactionType,
} from "../../libs/shared/types/+index.ts"

// Simple getEnvVar function for the script
function getEnvVar(key: string, isOptional = false): string {
  const value = Deno.env.get(key)
  if (!value && !isOptional) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value || ""
}

// Dynamic import of db service after env vars are set
const { db } = await import("../../apps/api/services/db.ts")

// Utility function to generate a random transfer code
function generateTransferCode(): string {
  return Math.random().toString(36).substring(2, 12).toUpperCase()
}

// Utility function to get date X days ago
function daysAgo(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}

async function cleanupExistingData() {
  console.log("🧹 Cleaning up existing test data...")

  try {
    await db.begin(async (tx) => {
      // Delete in reverse dependency order
      await tx.sql`DELETE FROM transactions_to_tags`
      await tx.sql`DELETE FROM transactions`
      await tx.sql`DELETE FROM categories`
      await tx.sql`DELETE FROM accounts`
      await tx.sql`DELETE FROM group_memberships`
      await tx.sql`DELETE FROM groups`
      await tx.sql`DELETE FROM user_push_tokens`
      await tx.sql`DELETE FROM user_sessions`
      await tx.sql`DELETE FROM user_keys`
      await tx.sql`DELETE FROM user_settings`
      await tx.sql`DELETE FROM users WHERE first_name = 'Test' AND last_name = 'User'`
      await tx.sql`DELETE FROM exchange_rates WHERE from_currency_id IN (SELECT id FROM currencies WHERE code IN ('USD', 'EUR', 'GBP', 'BTC', 'ETH', 'AUD', 'NZD'))`
      await tx.sql`DELETE FROM currencies WHERE code IN ('USD', 'EUR', 'GBP', 'BTC', 'ETH', 'AUD', 'NZD')`
      await tx.sql`DELETE FROM tags WHERE name IN ('Vacation', 'Business', 'Urgent', 'Australia', 'New Zealand')`
    })
    console.log("✅ Cleanup completed")
  } catch (error) {
    console.error("❌ Error during cleanup:", error)
    throw error
  }
}

async function seedData() {
  console.log("🌱 Starting Financy seed data creation...")

  // Clean up any existing test data first
  await cleanupExistingData()

  try {
    await db.begin(async (tx) => {
      console.log("Creating test user...")

      // 1. Create test user
      const user = await tx.user.createOne({
        data: {
          firstName: "Test",
          lastName: "User",
          role: UserRole.ADMIN,
          mfa: UserMFAStatus.NOT_CONFIGURED,
          lastLoginAt: new Date(),
        },
      })

      // 2. Create user key (password)
      const hashedPassword = await hash(TEST_PASSWORD, getEnvVar("AUTH_PEPPER"))
      const userKey = await tx.userKey.createOne({
        data: {
          userId: user.id,
          kind: UserKeyKind.USERNAME_PASSWORD,
          identification: TEST_EMAIL,
          secret: hashedPassword,
        },
      })

      // 3. Create user session
      const sessionToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
      const session = await tx.userSession.createOne({
        data: {
          token: sessionToken,
          userId: user.id,
          keyId: userKey.id,
          status: UserSessionStatus.ACTIVE,
          mfa: SessionMFAStatus.NOT_REQUIRED,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      })

      console.log("Creating currencies...")

      // 4. Create currencies (fiat and crypto)
      const usd = await tx.currency.createOne({
        data: {
          code: "USD",
          name: "US Dollar",
          symbol: "$",
          type: CurrencyType.FIAT,
          decimalPlaces: 2,
        },
      })

      const eur = await tx.currency.createOne({
        data: {
          code: "EUR",
          name: "Euro",
          symbol: "€",
          type: CurrencyType.FIAT,
          decimalPlaces: 2,
        },
      })

      const gbp = await tx.currency.createOne({
        data: {
          code: "GBP",
          name: "British Pound",
          symbol: "£",
          type: CurrencyType.FIAT,
          decimalPlaces: 2,
        },
      })

      const aud = await tx.currency.createOne({
        data: {
          code: "AUD",
          name: "Australian Dollar",
          symbol: "A$",
          type: CurrencyType.FIAT,
          decimalPlaces: 2,
        },
      })

      const nzd = await tx.currency.createOne({
        data: {
          code: "NZD",
          name: "New Zealand Dollar",
          symbol: "NZ$",
          type: CurrencyType.FIAT,
          decimalPlaces: 2,
        },
      })

      const btc = await tx.currency.createOne({
        data: {
          code: "BTC",
          name: "Bitcoin",
          symbol: "₿",
          type: CurrencyType.CRYPTO,
          decimalPlaces: 8,
        },
      })

      const eth = await tx.currency.createOne({
        data: {
          code: "ETH",
          name: "Ethereum",
          symbol: "Ξ",
          type: CurrencyType.CRYPTO,
          decimalPlaces: 18,
        },
      })

      console.log("Creating groups...")

      // 5. Create groups
      const personalGroup = await tx.group.createOne({
        data: {
          name: "Personal Finances",
          currencyId: usd.id,
        },
      })

      const businessGroup = await tx.group.createOne({
        data: {
          name: "Business Expenses",
          currencyId: eur.id,
        },
      })

      // 6. Create user settings
      await tx.userSettings.createOne({
        data: {
          id: user.id,
          theme: Theme.SYSTEM,
          selectedGroupId: personalGroup.id,
        },
      })

      // 7. Create group memberships
      await tx.groupMembership.createOne({
        data: {
          userId: user.id,
          groupId: personalGroup.id,
          role: GroupRole.OWNER,
        },
      })

      await tx.groupMembership.createOne({
        data: {
          userId: user.id,
          groupId: businessGroup.id,
          role: GroupRole.ADMIN,
        },
      })

      console.log("Creating historical exchange rates...")

      // 8. Create historical exchange rates (last 30 days)
      const exchangeRates = []
      for (let i = 0; i < 30; i++) {
        const date = daysAgo(i)
        exchangeRates.push(
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: eur.id,
              rate: 0.85 + Math.random() * 0.1,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: gbp.id,
              rate: 0.75 + Math.random() * 0.1,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: aud.id,
              rate: 0.65 + Math.random() * 0.1,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: nzd.id,
              rate: 0.60 + Math.random() * 0.1,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: btc.id,
              rate: 50000 + Math.random() * 10000,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: eth.id,
              rate: 3000 + Math.random() * 500,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
        )
      }
      await Promise.all(exchangeRates.flat())

      console.log("Creating accounts...")

      // 9. Create accounts
      const checkingAccount = await tx.account.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Checking Account",
          currencyId: usd.id,
          startingBalance: 500000, // $5,000.00
        },
      })

      const savingsAccount = await tx.account.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Savings Account",
          currencyId: usd.id,
          startingBalance: 1000000, // $10,000.00
        },
      })

      const businessAccount = await tx.account.createOne({
        data: {
          groupId: businessGroup.id,
          name: "Business Checking",
          currencyId: eur.id,
          startingBalance: 250000, // €2,500.00
        },
      })

      const btcWallet = await tx.account.createOne({
        data: {
          groupId: personalGroup.id, // Moved to personal group
          name: "BTC Wallet",
          currencyId: btc.id,
          startingBalance: 50000000, // 0.5 BTC
        },
      })

      const ethWallet = await tx.account.createOne({
        data: {
          groupId: personalGroup.id, // Moved to personal group
          name: "ETH Wallet",
          currencyId: eth.id,
          startingBalance: 2000000000000000000, // 2 ETH
        },
      })

      // Update groups with default accounts
      await tx.group.updateOne({
        id: personalGroup.id,
        data: { defaultAccountId: checkingAccount.id },
      })

      await tx.group.updateOne({
        id: businessGroup.id,
        data: { defaultAccountId: businessAccount.id },
      })

      console.log("Creating categories...")

      // 10. Create categories
      const foodCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Food & Dining",
          type: 1, // EXPENSE
          icon: "🍽️",
          color: "#FF6B6B",
          monthlyLimit: 50000, // $500
        },
      })

      const transportCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Transportation",
          type: 1, // EXPENSE
          icon: "🚗",
          color: "#4ECDC4",
        },
      })

      const travelCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Travel",
          type: 1, // EXPENSE
          icon: "✈️",
          color: "#45B7D1",
        },
      })

      const salaryCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Salary",
          type: 2, // INCOME
          icon: "💼",
          color: "#96CEB4",
        },
      })

      const cryptoMining = await tx.category.createOne({
        data: {
          groupId: personalGroup.id, // Moved to personal group
          name: "Crypto Mining",
          type: 2, // INCOME
          icon: "⛏️",
          color: "#FFD700",
        },
      })

      const businessSupplies = await tx.category.createOne({
        data: {
          groupId: businessGroup.id,
          name: "Office Supplies",
          type: 1, // EXPENSE
          icon: "📎",
          color: "#FFA07A",
        },
      })

      console.log("Creating tags...")

      // 11. Create tags
      const vacationTag = await tx.tag.createOne({
        data: { name: "Vacation" },
      })

      const australiaTag = await tx.tag.createOne({
        data: { name: "Australia" },
      })

      const newZealandTag = await tx.tag.createOne({
        data: { name: "New Zealand" },
      })

      const businessTag = await tx.tag.createOne({
        data: { name: "Business" },
      })

      const urgentTag = await tx.tag.createOne({
        data: { name: "Urgent" },
      })

      console.log("Creating transactions...")

      // 12. Create transactions (expenses, income, transfers)
      const transactions = []

      // Personal expenses in USD
      transactions.push(
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 2500, // $25.00
            categoryId: foodCategory.id,
            createdBy: user.id,
            memo: "Lunch at Italian restaurant",
            timestamp: daysAgo(1),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 4500, // $45.00
            categoryId: transportCategory.id,
            createdBy: user.id,
            memo: "Uber to airport",
            timestamp: daysAgo(2),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_IN,
            type: TransactionType.INCOME,
            amount: 300000, // $3,000.00
            categoryId: salaryCategory.id,
            createdBy: user.id,
            memo: "Monthly salary",
            timestamp: daysAgo(3),
          },
        }),
      )

      // Business expenses in EUR
      transactions.push(
        await tx.transaction.createOne({
          data: {
            groupId: businessGroup.id,
            accountId: businessAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 15000, // €150.00
            categoryId: businessSupplies.id,
            createdBy: user.id,
            memo: "Office stationery",
            timestamp: daysAgo(4),
          },
        }),
      )

      // Crypto transactions (moved to personal group)
      transactions.push(
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: btcWallet.id,
            direction: TransactionDirection.MONEY_IN,
            type: TransactionType.INCOME,
            amount: 10000000, // 0.1 BTC
            categoryId: cryptoMining.id,
            createdBy: user.id,
            memo: "Mining reward",
            timestamp: daysAgo(5),
          },
        }),
      )

      // Transfer between personal accounts
      const transferCode = generateTransferCode()
      const transferOut = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: checkingAccount.id,
          direction: TransactionDirection.MONEY_OUT,
          type: TransactionType.TRANSFER,
          amount: 100000, // $1,000.00
          linkedTransactionCode: transferCode,
          createdBy: user.id,
          memo: "Transfer to savings",
          timestamp: daysAgo(6),
        },
      })

      const transferIn = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: savingsAccount.id,
          direction: TransactionDirection.MONEY_IN,
          type: TransactionType.TRANSFER,
          amount: 100000, // $1,000.00
          linkedTransactionCode: transferCode,
          createdBy: user.id,
          memo: "Transfer from checking",
          timestamp: daysAgo(6),
        },
      })

      // Multi-currency transaction (European vacation dinner)
      transactions.push(
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 8500, // $85.00 (converted amount)
            originalCurrencyId: eur.id,
            originalAmount: 7500, // €75.00
            categoryId: foodCategory.id,
            createdBy: user.id,
            memo: "European vacation dinner",
            timestamp: daysAgo(7),
          },
        }),
      )

      // Australia trip expenses (multi-currency)
      const australiaFlight = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: checkingAccount.id,
          direction: TransactionDirection.MONEY_OUT,
          type: TransactionType.EXPENSE,
          amount: 850000, // $8,500.00 (converted amount)
          originalCurrencyId: aud.id,
          originalAmount: 1300000, // A$1,300.00
          categoryId: travelCategory.id,
          createdBy: user.id,
          memo: "Flight to Sydney, Australia",
          timestamp: daysAgo(14),
        },
      })

      const australiaHotel = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: checkingAccount.id,
          direction: TransactionDirection.MONEY_OUT,
          type: TransactionType.EXPENSE,
          amount: 375000, // $3,750.00 (converted amount)
          originalCurrencyId: aud.id,
          originalAmount: 575000, // A$575.00
          categoryId: travelCategory.id,
          createdBy: user.id,
          memo: "Hotel in Sydney for 5 nights",
          timestamp: daysAgo(13),
        },
      })

      // New Zealand trip expenses (multi-currency)
      const nzFlight = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: checkingAccount.id,
          direction: TransactionDirection.MONEY_OUT,
          type: TransactionType.EXPENSE,
          amount: 920000, // $9,200.00 (converted amount)
          originalCurrencyId: nzd.id,
          originalAmount: 1540000, // NZ$1,540.00
          categoryId: travelCategory.id,
          createdBy: user.id,
          memo: "Flight to Auckland, New Zealand",
          timestamp: daysAgo(21),
        },
      })

      const nzActivities = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: checkingAccount.id,
          direction: TransactionDirection.MONEY_OUT,
          type: TransactionType.EXPENSE,
          amount: 285000, // $2,850.00 (converted amount)
          originalCurrencyId: nzd.id,
          originalAmount: 480000, // NZ$480.00
          categoryId: travelCategory.id,
          createdBy: user.id,
          memo: "Adventure activities in Queenstown",
          timestamp: daysAgo(20),
        },
      })

      // Add tags to transactions
      await tx.sql`
        INSERT INTO transactions_to_tags (transaction_id, tag_id)
        VALUES
          (${transferOut.id}, ${vacationTag.id}),
          (${transferIn.id}, ${vacationTag.id}),
          (${australiaFlight.id}, ${australiaTag.id}),
          (${australiaFlight.id}, ${vacationTag.id}),
          (${australiaHotel.id}, ${australiaTag.id}),
          (${australiaHotel.id}, ${vacationTag.id}),
          (${nzFlight.id}, ${newZealandTag.id}),
          (${nzFlight.id}, ${vacationTag.id}),
          (${nzActivities.id}, ${newZealandTag.id}),
          (${nzActivities.id}, ${vacationTag.id}),
          (${transactions[0].id}, ${urgentTag.id})
      `

      console.log("✅ Seed data created successfully!")
      console.log(`Test user: ${TEST_EMAIL}`)
      console.log(`Password: ${TEST_PASSWORD}`)
      console.log(`Session token: ${session.token}`)
      console.log(`Groups created: Personal Finances, Business Expenses`)
      console.log(`Total transactions: ${transactions.length + 6}`) // +6 for transfers and travel expenses
      console.log(`Multi-currency transactions: Australia trip (AUD), New Zealand trip (NZD), European dinner (EUR)`)
    })
  } catch (error) {
    console.error("❌ Error creating seed data:", error)
    throw error
  }
}

// Run the seed script
if (import.meta.main) {
  await seedData()
}