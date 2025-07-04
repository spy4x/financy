import { describe, expect, it } from "@shared/testing"

import { calculateAccountBalance, calculateAccountBalances } from "./account-balance.ts"

// Import types directly to avoid path issues
const TransactionDirection = {
  MONEY_OUT: 1,
  MONEY_IN: 2,
} as const

const TransactionType = {
  EXPENSE: 1,
  INCOME: 2,
  TRANSFER: 3,
} as const

const mockAccount = {
  id: 1,
  groupId: 1,
  name: "Test Account",
  currencyId: 1,
  startingBalance: 100000, // $1000.00
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const mockTransactions = [
  {
    id: 1,
    groupId: 1,
    accountId: 1,
    linkedTransactionCode: null,
    direction: TransactionDirection.MONEY_OUT,
    type: TransactionType.EXPENSE,
    amount: -2500, // -$25.00 expense
    originalCurrencyId: undefined,
    originalAmount: 0,
    categoryId: 1,
    createdBy: 1,
    memo: "Coffee",
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 2,
    groupId: 1,
    accountId: 1,
    linkedTransactionCode: null,
    direction: TransactionDirection.MONEY_IN,
    type: TransactionType.INCOME,
    amount: 5000, // +$50.00 income
    originalCurrencyId: undefined,
    originalAmount: 0,
    categoryId: 2,
    createdBy: 1,
    memo: "Refund",
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  },
  {
    id: 3,
    groupId: 1,
    accountId: 1,
    linkedTransactionCode: null,
    direction: TransactionDirection.MONEY_OUT,
    type: TransactionType.EXPENSE,
    amount: -1000, // -$10.00 expense
    originalCurrencyId: undefined,
    originalAmount: 0,
    categoryId: 1,
    createdBy: 1,
    memo: "Lunch",
    timestamp: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: new Date(), // Deleted transaction should not affect balance
  },
]

describe("calculateAccountBalance", () => {
  it("should calculate balance correctly", () => {
    const balance = calculateAccountBalance(mockAccount, mockTransactions)

    // Starting: $1000.00 (100000)
    // -$25.00 (coffee) = 97500
    // +$50.00 (refund) = 102500
    // -$10.00 (lunch) ignored because deleted
    // Final: $1025.00 (102500)
    expect(balance).toBe(102500)
  })

  it("should handle account with no transactions", () => {
    const balance = calculateAccountBalance(mockAccount, [])
    expect(balance).toBe(100000) // Should return starting balance
  })

  it("should ignore transactions for other accounts", () => {
    const otherAccountTransaction = {
      ...mockTransactions[0],
      id: 99,
      accountId: 999, // Different account
    }

    const balance = calculateAccountBalance(mockAccount, [otherAccountTransaction])
    expect(balance).toBe(100000) // Should ignore transaction for other account
  })

  it("should handle zero starting balance", () => {
    const zeroAccount = {
      ...mockAccount,
      startingBalance: 0,
    }

    const balance = calculateAccountBalance(zeroAccount, mockTransactions)
    expect(balance).toBe(2500) // Only non-deleted transactions: -2500 + 5000 = 2500
  })

  it("should handle negative balance correctly", () => {
    const smallAccount = {
      ...mockAccount,
      startingBalance: 1000, // $10.00
    }

    const largeExpense = {
      ...mockTransactions[0],
      amount: -5000, // -$50.00 expense
    }

    const balance = calculateAccountBalance(smallAccount, [largeExpense])
    expect(balance).toBe(-4000) // $10.00 - $50.00 = -$40.00
  })
})

describe("calculateAccountBalances", () => {
  it("should calculate balances for multiple accounts efficiently", () => {
    const accounts = [
      mockAccount,
      {
        ...mockAccount,
        id: 2,
        name: "Second Account",
        startingBalance: 50000, // $500.00
      },
    ]

    const allTransactions = [
      ...mockTransactions,
      {
        ...mockTransactions[0],
        id: 10,
        accountId: 2,
        amount: -1500, // -$15.00 for second account
      },
    ]

    const balances = calculateAccountBalances(accounts, allTransactions)

    expect(balances.get(1)).toBe(102500) // First account: $1025.00
    expect(balances.get(2)).toBe(48500) // Second account: $485.00
    expect(balances.size).toBe(2)
  })
})
