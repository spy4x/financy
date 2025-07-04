import type { Account, Transaction } from "@shared/types"

/**
 * Calculate current balance for an account based on starting balance and transactions
 * @param account The account to calculate balance for
 * @param transactions All transactions for the account (filtered by accountId)
 * @returns Current balance in smallest currency unit
 */
export function calculateAccountBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((sum, txn) => {
    if (txn.accountId === account.id && !txn.deletedAt) {
      // Transactions are already signed correctly based on direction
      return sum + txn.amount
    }
    return sum
  }, account.startingBalance)
}

/**
 * Calculate balances for multiple accounts efficiently
 * @param accounts List of accounts
 * @param transactions All transactions (will be filtered by accountId)
 * @returns Map of accountId -> balance
 */
export function calculateAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
): Map<number, number> {
  const balances = new Map<number, number>()

  for (const account of accounts) {
    const accountTransactions = transactions.filter(
      (txn) => txn.accountId === account.id && !txn.deletedAt,
    )
    const balance = calculateAccountBalance(account, accountTransactions)
    balances.set(account.id, balance)
  }

  return balances
}
