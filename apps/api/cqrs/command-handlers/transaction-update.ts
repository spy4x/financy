import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionUpdateCommand } from "@api/cqrs/commands.ts"
import { TransactionUpdatedEvent } from "@api/cqrs/events.ts"
import { Account, Transaction, TransactionType, TransactionTypeUtils } from "@shared/types"

/**
 * Handler for updating a transaction
 * This includes updating account balance and category usage count
 * For transfers, also updates the linked transaction
 */
export const transactionUpdateHandler: CommandHandler<TransactionUpdateCommand> = async (
  command,
) => {
  const { transactionId, updates, userId, acknowledgmentId } = command.data

  console.log(`Updating transaction ${transactionId} for user ${userId}...`)

  try {
    const result = await db.begin(async (tx) => {
      // Verify legitimacy of the original transaction
      if (!(await db.transaction.verifyLegitimacyById(transactionId, userId))) {
        throw new Error("Transaction is not legitimate for this user")
      }

      // Get original transaction
      const originalTransaction = await tx.transaction.findOne({ id: transactionId })
      if (!originalTransaction) {
        throw new Error(`Transaction with id ${transactionId} not found`)
      }

      // Validate fields against transfer business rules
      const validationError = TransactionTypeUtils.validateFields({
        ...originalTransaction,
        ...updates,
      })
      if (validationError) {
        throw new Error(validationError)
      }

      // SECURITY: Enforce correct sign based on transaction type for any amount updates
      // Never trust frontend - backend validates and corrects the sign
      const correctedUpdates = { ...updates }

      if (updates.amount !== undefined || updates.type !== undefined) {
        const newType = updates.type ?? originalTransaction.type
        const newAmount = updates.amount ?? originalTransaction.amount

        // Enforce correct sign based on type
        const absoluteAmount = Math.abs(newAmount)
        const correctedAmount = newType === TransactionType.DEBIT
          ? -absoluteAmount // DEBIT: always negative
          : absoluteAmount // CREDIT/TRANSFER: always positive

        correctedUpdates.amount = correctedAmount

        // Apply the same correction to original amount if being updated
        if (updates.originalAmount !== undefined) {
          const absoluteOriginalAmount = Math.abs(updates.originalAmount)
          correctedUpdates.originalAmount = newType === TransactionType.DEBIT
            ? -absoluteOriginalAmount
            : absoluteOriginalAmount
        }
      }

      // Verify legitimacy of the corrected updates
      if (
        !(await db.transaction.verifyLegitimacy(
          { ...originalTransaction, ...correctedUpdates },
          userId,
        ))
      ) {
        throw new Error("Transaction update is not legitimate")
      }

      // Update the transaction with corrected data
      const transaction = await tx.transaction.updateOne({
        id: transactionId,
        data: correctedUpdates,
      })

      let accountUpdated: Account
      let linkedTransaction: Transaction | null = null
      let linkedAccountUpdated: Account | null = null

      // Handle balance updates
      if (correctedUpdates.amount !== undefined) {
        const newAmount = correctedUpdates.amount
        const originalAmount = originalTransaction.amount

        // Calculate the difference in account balance
        // Both amounts are already signed (negative for DEBIT, positive for CREDIT/TRANSFER)
        const balanceDiff = newAmount - originalAmount

        accountUpdated = await tx.account.updateBalance(
          originalTransaction.accountId,
          balanceDiff,
        )

        // If this is a transfer, update the linked transaction and its account balance
        if (originalTransaction.linkedTransactionCode) {
          const linkedTransactions = await tx.transaction.findByLinkedTransactionCode(
            originalTransaction.linkedTransactionCode,
            userId,
          )

          // Find the other transaction in the transfer pair (not the current one)
          const linkedTransactionData = linkedTransactions.find(
            (t) => t.id !== originalTransaction.id,
          )

          if (linkedTransactionData) {
            // For the linked transaction, the amount should be the opposite sign
            const linkedAmount = -newAmount
            const linkedBalanceDiff = linkedAmount - (-originalAmount)

            linkedTransaction = await tx.transaction.updateOne({
              id: linkedTransactionData.id,
              data: { amount: linkedAmount },
            })

            linkedAccountUpdated = await tx.account.updateBalance(
              linkedTransactionData.accountId,
              linkedBalanceDiff,
            )
          }
        }
      } else {
        // Just fetch the account without updating balance
        const account = await tx.account.findOne({ id: originalTransaction.accountId })
        if (!account) {
          throw new Error(`Account with id ${originalTransaction.accountId} not found`)
        }
        accountUpdated = account
      }

      // Handle timestamp updates for linked transactions (transfers)
      if (correctedUpdates.timestamp !== undefined && originalTransaction.linkedTransactionCode) {
        const linkedTransactions = await tx.transaction.findByLinkedTransactionCode(
          originalTransaction.linkedTransactionCode,
          userId,
        )

        // Update timestamp of all linked transactions (excluding the current one)
        for (const linkedTxn of linkedTransactions) {
          if (linkedTxn.id !== originalTransaction.id) {
            await tx.transaction.updateOne({
              id: linkedTxn.id,
              data: { timestamp: correctedUpdates.timestamp },
            })

            // Update linkedTransaction if it was already set for amount updates
            if (linkedTransaction && linkedTransaction.id === linkedTxn.id) {
              linkedTransaction = { ...linkedTransaction, timestamp: correctedUpdates.timestamp }
            }
          }
        }
      }

      return {
        transaction,
        originalTransaction,
        accountUpdated,
        linkedTransaction,
        linkedAccountUpdated,
      }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionUpdatedEvent({
        transaction: result.transaction,
        originalTransaction: result.originalTransaction,
        accountUpdated: result.accountUpdated,
        acknowledgmentId,
      }),
    )

    // Emit event for linked transaction if updated
    if (result.linkedTransaction && result.linkedAccountUpdated) {
      eventBus.emit(
        new TransactionUpdatedEvent({
          transaction: result.linkedTransaction,
          originalTransaction: result.linkedTransaction, // Use the updated transaction as both
          accountUpdated: result.linkedAccountUpdated,
          acknowledgmentId,
        }),
      )
    }

    console.log(`✅ Transaction ${transactionId} updated successfully for user ${userId}`)

    return {
      transaction: result.transaction,
      originalTransaction: result.originalTransaction,
    }
  } catch (error) {
    console.error(`❌ Failed to update transaction ${transactionId} for user ${userId}:`, error)
    throw error
  }
}
