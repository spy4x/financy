import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionDeleteCommand } from "@api/cqrs/commands.ts"
import { TransactionDeletedEvent } from "@api/cqrs/events.ts"

/**
 * Handler for deleting a transaction
 * This includes reverting account balance and category usage count
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

      // Decrease category usage count
      const categoryUpdated = await tx.category.decrementUsage(originalTransaction.categoryId)

      return { transaction, accountUpdated, categoryUpdated }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionDeletedEvent({
        transaction: result.transaction,
        accountUpdated: result.accountUpdated,
        categoryUpdated: result.categoryUpdated,
        acknowledgmentId,
      }),
    )

    console.log(`✅ Transaction ${transactionId} deleted successfully for user ${userId}`)

    return { transaction: result.transaction }
  } catch (error) {
    console.error(`❌ Failed to delete transaction ${transactionId} for user ${userId}:`, error)
    throw error
  }
}
