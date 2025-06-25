import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionUndeleteCommand } from "@api/cqrs/commands.ts"
import { TransactionUndeletedEvent } from "@api/cqrs/events.ts"

/**
 * Handler for undeleting (restoring) a transaction
 * This includes re-applying account balance changes
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

      // Re-apply account balance change
      // Amount is already signed, so we add it back
      const balanceChange = originalTransaction.amount

      const accountUpdated = await tx.account.updateBalance(
        originalTransaction.accountId,
        balanceChange,
      )

      return { transaction, accountUpdated }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionUndeletedEvent({
        transaction: result.transaction,
        accountUpdated: result.accountUpdated,
        acknowledgmentId,
      }),
    )

    console.log(`✅ Transaction ${transactionId} undeleted successfully for user ${userId}`)

    return { transaction: result.transaction }
  } catch (error) {
    console.error(`❌ Failed to undelete transaction ${transactionId} for user ${userId}:`, error)
    throw error
  }
}
