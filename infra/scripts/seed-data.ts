#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read

// =============================================================================
// Seed Data Script
// =============================================================================
// This script creates comprehensive test data to
// enable thorough testing of UI and API functionality.
//
// What it creates:
// - Test User: test@test.com / pass1234
// - 2 Groups: Personal Finances (USD), Business Expenses (EUR)
// - 5 Accounts: Checking/Savings in USD, Business in EUR, BTC/ETH wallets (in Personal group)
// - 6 Categories: Food, Transport, Travel, Salary, Office Supplies, Mining Rewards
// - Historical Exchange Rates: 30 days of rates for USD↔EUR, USD↔GBP, USD↔AUD, USD↔NZD, USD↔BTC, USD↔ETH
// - 15+ Transactions: Expenses, income, transfers, multi-currency transactions, travel expenses
// - Tags: Vacation, Australia, New Zealand, Business, Urgent (associated with transactions)
// - User Settings & Sessions: Complete authentication setup
//
// Usage:
// Prerequisites:
// 1. Ensure the database is running and migrations are applied:
//    deno task compose up -d
// 2. Wait for the database to be ready (check logs if needed)
//
// Running the Script:
// Execute the seed script using deno task alias:
// ```sh
// deno task db:seed
// ```
// or directly with deno:
// ```sh
// deno run --allow-net --allow-env --allow-read infra/scripts/seed-data.ts
// ```
//
// Expected Output:
// 🌱 Starting Financy seed data creation...
// Creating test user...
// Creating currencies...
// Creating historical exchange rates...
// Creating groups...
// Creating accounts...
// Creating categories...
// Creating tags...
// Creating transactions...
// ✅ Seed data created successfully!
// Test user: test@test.com
// Password: pass1234
// Session token: [generated-token]
// Groups created: Personal Finances, Business Expenses
// Total transactions: 15+
// =============================================================================

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

// Test credentials
const TEST_EMAIL = "test@test.com"
const TEST_PASSWORD = "pass1234"

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
      // Simple cleanup - just wipe all test data
      await tx.sql`TRUNCATE transactions_to_tags, transactions, categories, accounts, group_memberships, groups, user_push_tokens, user_sessions, user_keys, user_settings, users, tags, exchange_rates, currencies CASCADE`
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
        userId: user.id,
        kind: UserKeyKind.USERNAME_PASSWORD,
        identification: TEST_EMAIL,
        secret: hashedPassword,
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

      // 4. Create currencies (fiat only - no crypto for now)
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

      const jpy = await tx.currency.createOne({
        data: {
          code: "JPY",
          name: "Japanese Yen",
          symbol: "¥",
          type: CurrencyType.FIAT,
          decimalPlaces: 0,
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

      // 8. Create historical exchange rates (last 30 days) - fiat only
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
              toCurrencyId: jpy.id,
              rate: 155.5954,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: aud.id,
              rate: 1.50 + Math.random() * 0.1,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
          tx.exchangeRate.createOne({
            data: {
              fromCurrencyId: usd.id,
              toCurrencyId: nzd.id,
              rate: 1.65 + Math.random() * 0.1,
              date: date.toISOString().split('T')[0],
              fetchedAt: date,
            },
          }),
        )
      }
      await Promise.all(exchangeRates.flat())

      console.log("Creating accounts...")

      // 9. Create accounts (no crypto wallets)
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

      const euroTravelAccount = await tx.account.createOne({
        data: {
          groupId: personalGroup.id,
          name: "EUR Travel Fund",
          currencyId: eur.id,
          startingBalance: 0, // €0.00 - will transfer money here
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

      const gbpAccount = await tx.account.createOne({
        data: {
          groupId: personalGroup.id,
          name: "GBP Account",
          currencyId: gbp.id,
          startingBalance: 100000, // £1,000.00
        },
      })

      const jpyAccount = await tx.account.createOne({
        data: {
          groupId: personalGroup.id,
          name: "JPY Account",
          currencyId: jpy.id,
          startingBalance: 10000, // ¥10,000 (0 decimal places)
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

      // 10. Create categories (no crypto category)
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

      const entertainmentCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Entertainment",
          type: 1, // EXPENSE
          icon: "🎬",
          color: "#9B59B6",
        },
      })

      const shoppingCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Shopping",
          type: 1, // EXPENSE
          icon: "🛍️",
          color: "#E74C3C",
        },
      })

      const healthCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Health & Fitness",
          type: 1, // EXPENSE
          icon: "💪",
          color: "#27AE60",
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

      const freelanceCategory = await tx.category.createOne({
        data: {
          groupId: personalGroup.id,
          name: "Freelance",
          type: 2, // INCOME
          icon: "💻",
          color: "#3498DB",
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

      // 12. Create transactions with realistic smaller amounts
      const transactions = []

      // Personal expenses in USD - varied daily expenses
      transactions.push(
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 1250, // $12.50
            categoryId: foodCategory.id,
            createdBy: user.id,
            memo: "Coffee and pastry",
            timestamp: daysAgo(1),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 3580, // $35.80
            categoryId: foodCategory.id,
            createdBy: user.id,
            memo: "Lunch at local diner",
            timestamp: daysAgo(1),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 1850, // $18.50
            categoryId: transportCategory.id,
            createdBy: user.id,
            memo: "Uber to work",
            timestamp: daysAgo(2),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 4299, // $42.99
            categoryId: shoppingCategory.id,
            createdBy: user.id,
            memo: "New t-shirt",
            timestamp: daysAgo(2),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 15999, // $159.99
            categoryId: healthCategory.id,
            createdBy: user.id,
            memo: "Gym membership - monthly",
            timestamp: daysAgo(3),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 2450, // $24.50
            categoryId: entertainmentCategory.id,
            createdBy: user.id,
            memo: "Movie tickets",
            timestamp: daysAgo(4),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 6790, // $67.90
            categoryId: foodCategory.id,
            createdBy: user.id,
            memo: "Grocery shopping",
            timestamp: daysAgo(5),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 8900, // $89.00
            categoryId: shoppingCategory.id,
            createdBy: user.id,
            memo: "Amazon order - household items",
            timestamp: daysAgo(6),
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
            memo: "Gas station fill-up",
            timestamp: daysAgo(7),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 12500, // $125.00
            categoryId: entertainmentCategory.id,
            createdBy: user.id,
            memo: "Concert tickets",
            timestamp: daysAgo(8),
          },
        }),
      )

      // Income transactions
      transactions.push(
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_IN,
            type: TransactionType.INCOME,
            amount: 450000, // $4,500.00
            categoryId: salaryCategory.id,
            createdBy: user.id,
            memo: "Bi-weekly paycheck",
            timestamp: daysAgo(3),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_IN,
            type: TransactionType.INCOME,
            amount: 75000, // $750.00
            categoryId: freelanceCategory.id,
            createdBy: user.id,
            memo: "Website project payment",
            timestamp: daysAgo(10),
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
        await tx.transaction.createOne({
          data: {
            groupId: businessGroup.id,
            accountId: businessAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 8500, // €85.00
            categoryId: businessSupplies.id,
            createdBy: user.id,
            memo: "Printer ink cartridges",
            timestamp: daysAgo(12),
          },
        }),
      )

      // Transfer between personal accounts (USD to USD)
      const transferCode = generateTransferCode()
      const transferOut = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: checkingAccount.id,
          direction: TransactionDirection.MONEY_OUT,
          type: TransactionType.TRANSFER,
          amount: 50000, // $500.00
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
          amount: 50000, // $500.00
          linkedTransactionCode: transferCode,
          createdBy: user.id,
          memo: "Transfer from checking",
          timestamp: daysAgo(6),
        },
      })

      // Transfer from USD checking to EUR travel fund before Paris trip
      const euroTransferCode = generateTransferCode()
      const euroTransferOut = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: checkingAccount.id,
          direction: TransactionDirection.MONEY_OUT,
          type: TransactionType.TRANSFER,
          amount: 20000, // $200.00
          originalCurrencyId: eur.id,
          originalAmount: 17500, // €175.00 (converted)
          linkedTransactionCode: euroTransferCode,
          createdBy: user.id,
          memo: "Fund EUR travel account for Paris trip",
          timestamp: daysAgo(8),
        },
      })

      const euroTransferIn = await tx.transaction.createOne({
        data: {
          groupId: personalGroup.id,
          accountId: euroTravelAccount.id,
          direction: TransactionDirection.MONEY_IN,
          type: TransactionType.TRANSFER,
          amount: 17500, // €175.00
          linkedTransactionCode: euroTransferCode,
          createdBy: user.id,
          memo: "Received from USD checking for Paris trip",
          timestamp: daysAgo(8),
        },
      })

      // Multi-currency transactions with realistic amounts
      transactions.push(
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: euroTravelAccount.id, // Using EUR travel account now
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 7500, // €75.00 (no conversion needed - same currency)
            categoryId: foodCategory.id,
            createdBy: user.id,
            memo: "Dinner in Paris",
            timestamp: daysAgo(7),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 12000, // $120.00
            originalCurrencyId: gbp.id,
            originalAmount: 9500, // £95.00
            categoryId: entertainmentCategory.id,
            createdBy: user.id,
            memo: "Theatre tickets in London",
            timestamp: daysAgo(14),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 18500, // $185.00
            originalCurrencyId: aud.id,
            originalAmount: 28000, // A$280.00
            categoryId: travelCategory.id,
            createdBy: user.id,
            memo: "Hotel in Sydney - 2 nights",
            timestamp: daysAgo(20),
          },
        }),
        await tx.transaction.createOne({
          data: {
            groupId: personalGroup.id,
            accountId: checkingAccount.id,
            direction: TransactionDirection.MONEY_OUT,
            type: TransactionType.EXPENSE,
            amount: 14500, // $145.00
            originalCurrencyId: nzd.id,
            originalAmount: 24000, // NZ$240.00
            categoryId: travelCategory.id,
            createdBy: user.id,
            memo: "Day trip activities in Queenstown",
            timestamp: daysAgo(25),
          },
        }),
      )

      // Add tags to transactions
      // transactions[0] = coffee (urgent)
      // transactions[14] = Dinner in Paris (EUR) - from EUR travel account
      // transactions[15] = Theatre in London (GBP)
      // transactions[16] = Hotel in Sydney (AUD - Australia tag + vacation)
      // transactions[17] = Queenstown activities (NZD - New Zealand tag + vacation)
      await tx.sql`
        INSERT INTO transactions_to_tags (transaction_id, tag_id)
        VALUES
          (${transferOut.id}, ${vacationTag.id}),
          (${transferIn.id}, ${vacationTag.id}),
          (${euroTransferOut.id}, ${vacationTag.id}),
          (${euroTransferIn.id}, ${vacationTag.id}),
          (${transactions[14].id}, ${vacationTag.id}),
          (${transactions[16].id}, ${australiaTag.id}),
          (${transactions[16].id}, ${vacationTag.id}),
          (${transactions[17].id}, ${newZealandTag.id}),
          (${transactions[17].id}, ${vacationTag.id}),
          (${transactions[0].id}, ${urgentTag.id})
      `

      console.log("✅ Seed data created successfully!")
      console.log(`Test user: ${TEST_EMAIL}`)
      console.log(`Password: ${TEST_PASSWORD}`)
      console.log(`Session token: ${session.token}`)
      console.log(`Groups created: Personal Finances, Business Expenses`)
      console.log(`Accounts: 4 total (USD Checking, USD Savings, EUR Travel Fund, EUR Business)`)
      console.log(`Total transactions: ${transactions.length + 4}`) // +4 for two transfer pairs (USD-USD and USD-EUR)
      console.log(
        `Multi-currency transactions: Dinner in Paris (EUR), Theatre in London (GBP), Hotel in Sydney (AUD), Activities in Queenstown (NZD)`,
      )
      console.log(`✅ Seed data created successfully!`)
    })
  } catch (error) {
    console.error("❌ Error creating seed data:", error)
    throw error
  }
}

// Run the seed script
if (import.meta.main) {
  await seedData()
  await db.shutdown()
}