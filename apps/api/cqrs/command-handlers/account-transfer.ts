import { CommandHandler } from "@shared/cqrs/types.ts"
import { AccountTransferCommand } from "@api/cqrs/commands.ts"
import { AccountTransferEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { convertAmount, getExchangeRate } from "@shared/helpers/currency.ts"
import { TransactionDirection, TransactionType } from "@shared/types"
import { getRandomString } from "@shared/helpers/random.ts"

/**
 * Handler for transferring money between accounts
 * This creates two linked TRANSFER transactions with proper cross-linking
 * No categories are used - transfers don't affect profit/loss reporting
 */
export const AccountTransferHandler: CommandHandler<AccountTransferCommand> = async (command) => {
  const {
    fromAccountId,
    toAccountId,
    amount,
    memo,
    timestamp,
    userId,
    acknowledgmentId,
    exchangeRate,
    conversionDate: _conversionDate,
  } = command.data

  console.log(
    `Transferring ${amount} from account ${fromAccountId} to ${toAccountId} for user ${userId}...`,
  )

  try {
    // Validation
    if (fromAccountId === toAccountId) {
      throw new Error("Cannot transfer to the same account")
    }

    if (amount <= 0) {
      throw new Error("Transfer amount must be positive")
    }

    const result = await db.begin(async (tx) => {
      // Verify user has access to both accounts
      const fromAccount = await tx.account.findOne({ id: fromAccountId })
      const toAccount = await tx.account.findOne({ id: toAccountId })

      if (!fromAccount || !toAccount) {
        throw new Error("One or both accounts not found")
      }

      // Verify legitimacy for both accounts
      const hasAccessFrom = await db.account.verifyLegitimacy(fromAccount, userId)
      const hasAccessTo = await db.account.verifyLegitimacy(toAccount, userId)

      if (!hasAccessFrom || !hasAccessTo) {
        throw new Error("Access denied to one or both accounts")
      }

      // Check if accounts belong to the same group (for now, only allow transfers within same group)
      if (fromAccount.groupId !== toAccount.groupId) {
        throw new Error("Transfers are only allowed between accounts in the same group")
      }

      // Handle cross-currency conversion if accounts have different currencies
      let convertedAmount = amount
      let originalCurrencyId: number | undefined
      let originalAmount: number | undefined
      let actualExchangeRate: number | undefined

      if (fromAccount.currencyId !== toAccount.currencyId) {
        // Cross-currency transfer
        originalCurrencyId = fromAccount.currencyId
        originalAmount = amount

        if (exchangeRate) {
          // Use provided exchange rate
          convertedAmount = Math.round(amount * exchangeRate)
          actualExchangeRate = exchangeRate
        } else {
          // Fetch exchange rates from database within transaction
          const exchangeRates = await db.exchangeRate.findMany()

          actualExchangeRate = getExchangeRate(
            fromAccount.currencyId,
            toAccount.currencyId,
            exchangeRates,
          )
          convertedAmount = convertAmount(
            amount,
            fromAccount.currencyId,
            toAccount.currencyId,
            exchangeRates,
          )
        }

        console.log(
          `Cross-currency transfer: ${amount} (${fromAccount.currencyId}) = ${convertedAmount} (${toAccount.currencyId}) at rate ${actualExchangeRate}`,
        )
      }

      const transferMemo = memo
        ? `Transfer: ${memo}`
        : `Transfer from ${fromAccount.name} to ${toAccount.name}`

      // Generate a unique code to link the two transfer transactions
      const linkedTransactionCode = getRandomString(10)

      // Create first TRANSFER transaction (from source account)
      const fromTransaction = await tx.transaction.createOne({
        data: {
          groupId: fromAccount.groupId,
          accountId: fromAccountId, // Source account
          categoryId: null, // No category for transfers
          type: TransactionType.TRANSFER,
          direction: TransactionDirection.MONEY_OUT,
          amount: -Math.abs(amount), // MONEY_OUT = negative amount (in source currency)
          memo: transferMemo,
          timestamp: timestamp || new Date(), // Use provided timestamp or current time
          createdBy: userId,
          originalCurrencyId: undefined, // Source transaction uses account currency
          originalAmount: 0,
          linkedTransactionCode, // Link both transactions with the same code
        },
      })

      // Create second TRANSFER transaction (to destination account)
      const toTransaction = await tx.transaction.createOne({
        data: {
          groupId: toAccount.groupId, // Use destination account's group
          accountId: toAccountId, // Destination account
          categoryId: null, // No category for transfers
          type: TransactionType.TRANSFER,
          direction: TransactionDirection.MONEY_IN,
          amount: Math.abs(convertedAmount), // MONEY_IN = positive amount (in destination currency)
          memo: transferMemo,
          timestamp: timestamp || new Date(), // Use provided timestamp or current time
          createdBy: userId,
          originalCurrencyId, // Store original currency info if cross-currency
          originalAmount: originalAmount || 0,
          linkedTransactionCode, // Link both transactions with the same code
        },
      })

      return {
        fromTransaction,
        toTransaction,
      }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new AccountTransferEvent({
        fromTransaction: result.fromTransaction,
        toTransaction: result.toTransaction,
        acknowledgmentId,
      }),
    )

    console.log(
      `✅ Transfer completed successfully from account ${fromAccountId} to ${toAccountId}`,
    )

    return result
  } catch (error) {
    console.error(`❌ Failed to transfer between accounts for user ${userId}:`, error)
    throw error
  }
}
