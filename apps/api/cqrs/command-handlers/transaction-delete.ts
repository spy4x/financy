import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionDeleteCommand } from "@api/cqrs/commands.ts"
import { TransactionDeletedEvent } from "@api/cqrs/events.ts"
import { Transaction } from "@shared/types"

/**
 * Handler for deleting a transaction
 * This includes reverting account balance changes and handling transfer pairs
 */
export const transactionDeleteHandler: CommandHandler<TransactionDeleteCommand> = async (
  command,
) => {
  const { transactionId, userId, acknowledgmentId } = command.data

  console.log(`Deleting transaction ${transactionId} for user ${userId}...`)

  try {
    // Verify legitimacy before processing
    if (await db.transaction.verifyLegitimacyById(transactionId, userId) === false) {
      throw new Error("Transaction is not legitimate for this user")
    }

    const result = await db.begin(async (tx) => {
      // Get original transaction to revert balance change
      const originalTransaction = await tx.transaction.findOne({ id: transactionId })

      if (!originalTransaction) {
        throw new Error(`Transaction with id ${transactionId} not found`)
      }

      // Soft delete the transaction
      const transaction = await tx.transaction.deleteOne({ id: transactionId })

      // Revert account balance
      // Amount is already signed, so we need to subtract it to revert
      const balanceChange = -originalTransaction.amount

      const accountUpdated = await tx.account.updateBalance(
        originalTransaction.accountId,
        balanceChange,
      )

      let linkedTransaction: Transaction | null = null
      let linkedAccountUpdated = null

      // If this is a transfer, also delete the linked transaction
      if (originalTransaction.linkedTransactionId) {
        const linkedTransactionData = await tx.transaction.findOne({
          id: originalTransaction.linkedTransactionId,
        })

        if (linkedTransactionData) {
          linkedTransaction = await tx.transaction.deleteOne({
            id: originalTransaction.linkedTransactionId,
          })

          // Revert the linked account balance
          const linkedBalanceChange = -linkedTransactionData.amount

          linkedAccountUpdated = await tx.account.updateBalance(
            linkedTransactionData.accountId,
            linkedBalanceChange,
          )
        }
      }

      return { transaction, accountUpdated, linkedTransaction, linkedAccountUpdated }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionDeletedEvent({
        transaction: result.transaction,
        accountUpdated: result.accountUpdated,
        acknowledgmentId,
      }),
    )

    // Emit event for linked transaction if deleted
    if (result.linkedTransaction && result.linkedAccountUpdated) {
      eventBus.emit(
        new TransactionDeletedEvent({
          transaction: result.linkedTransaction,
          accountUpdated: result.linkedAccountUpdated,
          acknowledgmentId,
        }),
      )
    }

    console.log(`✅ Transaction ${transactionId} deleted successfully for user ${userId}`)

    return { transaction: result.transaction }
  } catch (error) {
    console.error(`❌ Failed to delete transaction ${transactionId} for user ${userId}:`, error)
    throw error
  }
}
