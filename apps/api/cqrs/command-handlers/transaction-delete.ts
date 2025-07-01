import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionDeleteCommand } from "@api/cqrs/commands.ts"
import { TransactionDeletedEvent } from "@api/cqrs/events.ts"
import { Transaction } from "@shared/types"

/**
 * Handler for deleting a transaction
 * Balance is calculated on the frontend from transactions
 * For transfers, also deletes the linked transaction
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

      let linkedTransaction: Transaction | null = null

      // If this is a transfer, also delete the linked transaction
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
          linkedTransaction = await tx.transaction.deleteOne({
            id: linkedTransactionData.id,
          })
        }
      }

      return { transaction, linkedTransaction }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionDeletedEvent({
        transaction: result.transaction,
        acknowledgmentId,
      }),
    )

    // Emit event for linked transaction if deleted
    if (result.linkedTransaction) {
      eventBus.emit(
        new TransactionDeletedEvent({
          transaction: result.linkedTransaction,
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
