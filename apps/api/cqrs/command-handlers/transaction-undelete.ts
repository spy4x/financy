import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionUndeleteCommand } from "@api/cqrs/commands.ts"
import { TransactionUndeletedEvent } from "@api/cqrs/events.ts"
import { Transaction } from "@shared/types"

/**
 * Handler for undeleting (restoring) a transaction
 * Balance is calculated on the frontend from transactions
 * For transfers, also restores the linked transaction
 */
export const transactionUndeleteHandler: CommandHandler<TransactionUndeleteCommand> = async (
  command,
) => {
  const { transactionId, userId, acknowledgmentId } = command.data

  console.log(`Undeleting transaction ${transactionId} for user ${userId}...`)

  try {
    // Verify legitimacy before processing
    if (await db.transaction.verifyLegitimacyById(transactionId, userId) === false) {
      throw new Error("Transaction is not legitimate for this user")
    }

    const result = await db.begin(async (tx) => {
      // Get the transaction to check if it's actually deleted
      const originalTransaction = await tx.transaction.findOne({ id: transactionId })
      if (!originalTransaction) {
        throw new Error(`Transaction with id ${transactionId} not found`)
      }

      if (!originalTransaction.deletedAt) {
        throw new Error(`Transaction ${transactionId} is not deleted`)
      }

      // Restore the transaction
      const transaction = await tx.transaction.undeleteOne({ id: transactionId })

      let linkedTransaction: Transaction | null = null

      // If this is a transfer, also restore the linked transaction
      if (originalTransaction.linkedTransactionCode) {
        const linkedTransactions = await tx.transaction.findByLinkedTransactionCode(
          originalTransaction.linkedTransactionCode,
          userId,
        )

        // Find the other transaction in the transfer pair (not the current one)
        const linkedTransactionData = linkedTransactions.find(
          (t) => t.id !== originalTransaction.id,
        )

        if (linkedTransactionData && linkedTransactionData.deletedAt) {
          linkedTransaction = await tx.transaction.undeleteOne({
            id: linkedTransactionData.id,
          })
        }
      }

      return { transaction, linkedTransaction }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionUndeletedEvent({
        transaction: result.transaction,
        acknowledgmentId,
      }),
    )

    // Emit event for linked transaction if restored
    if (result.linkedTransaction) {
      eventBus.emit(
        new TransactionUndeletedEvent({
          transaction: result.linkedTransaction,
          acknowledgmentId,
        }),
      )
    }

    console.log(`✅ Transaction ${transactionId} undeleted successfully for user ${userId}`)

    return { transaction: result.transaction }
  } catch (error) {
    console.error(`❌ Failed to undelete transaction ${transactionId} for user ${userId}:`, error)
    throw error
  }
}
