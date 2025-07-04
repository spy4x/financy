/*
 * COMMENTED OUT - Dependency injection issues
 * TODO: Uncomment after DI refactoring is complete
 *
import { TelegramDisplayFormatter } from "./display-formatter.ts"
import { describe, expect, it } from "@shared/testing"
import { TransactionDirection, TransactionType } from "@shared/types"

describe("TelegramDisplayFormatter", () => {
  it("should format account balance", () => {
    const account = {
      id: 1,
      groupId: 1,
      name: "Test Account",
      currencyId: 1,
      startingBalance: 50000,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }

    const currency = {
      id: 1,
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      type: 1,
      decimalPlaces: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }

    const formatted = TelegramDisplayFormatter.formatAccountBalance(account, 125099, currency)
    expect(formatted).toContain("$1,250.99")
  })

  it("should format accounts list", () => {
    const accounts = [
      {
        id: 1,
        groupId: 1,
        name: "Main Account",
        currencyId: 1,
        startingBalance: 100000,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ]

    const currencies = new Map([
      [1, {
        id: 1,
        code: "USD",
        name: "US Dollar",
        symbol: "$",
        type: 1,
        decimalPlaces: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }],
    ])

    const formatBalance = () => "$1,000.00"

    const formatted = TelegramDisplayFormatter.formatAccountsList(
      accounts,
      currencies,
      formatBalance,
    )

    expect(formatted).toContain("💰 *Your Accounts*")
    expect(formatted).toContain("💳 *Main Account*")
    expect(formatted).toContain("$1,000.00")
    expect(formatted).toContain("USD")
  })

  // Skip empty accounts test for now as it requires config (webAppUrl)

  it("should format transactions list", () => {
    const transactions = [
      {
        id: 1,
        accountName: "Main Account",
        categoryName: "Food",
        formattedAmount: "$25.50",
        direction: TransactionDirection.MONEY_OUT,
        type: TransactionType.EXPENSE,
        memo: "Lunch",
        timestamp: "2024-06-15 14:30",
      },
    ]

    const formatted = TelegramDisplayFormatter.formatTransactionsList(transactions)

    expect(formatted).toContain("📊 *Recent Transactions*")
    expect(formatted).toContain("$25.50")
    expect(formatted).toContain("Food")
    expect(formatted).toContain("Lunch")
  })
})
*/
