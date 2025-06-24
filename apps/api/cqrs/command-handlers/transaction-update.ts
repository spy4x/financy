import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionUpdateCommand } from "@api/cqrs/commands.ts"
import { TransactionUpdatedEvent } from "@api/cqrs/events.ts"
import { Account, Category, TransactionType } from "@shared/types"

/**
 * Handler for updating a transaction
 * This includes updating account balance and category usage count
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

      // Verify legitimacy of the updates
      if (
        !(await db.transaction.verifyLegitimacy({ ...originalTransaction, ...updates }, userId))
      ) {
        throw new Error("Transaction update is not legitimate")
      }

      // Update the transaction
      const transaction = await tx.transaction.updateOne({ id: transactionId, data: updates })

      let accountUpdated: Account
      let oldCategoryUpdated: Category | undefined
      let newCategoryUpdated: Category | undefined

      // Calculate balance change if amount or type changed
      if (updates.amount !== undefined || updates.type !== undefined) {
        const newAmount = updates.amount ?? originalTransaction.amount
        const newType = updates.type ?? originalTransaction.type

        // Calculate the difference in account balance
        const originalBalance = originalTransaction.type === TransactionType.DEBIT
          ? -originalTransaction.amount
          : originalTransaction.amount
        const newBalance = newType === TransactionType.DEBIT ? -newAmount : newAmount
        const balanceDiff = newBalance - originalBalance

        accountUpdated = await tx.account.updateBalance(
          originalTransaction.accountId,
          balanceDiff,
        )
      } else {
        // Just fetch the account without updating balance
        const account = await tx.account.findOne({ id: originalTransaction.accountId })
        if (!account) {
          throw new Error(`Account with id ${originalTransaction.accountId} not found`)
        }
        accountUpdated = account
      }

      // Update category usage count if category changed
      if (
        updates.categoryId !== undefined && updates.categoryId !== originalTransaction.categoryId
      ) {
        // Decrease old category usage
        oldCategoryUpdated = await tx.category.decrementUsage(originalTransaction.categoryId)

        // Increase new category usage
        newCategoryUpdated = await tx.category.incrementUsage(updates.categoryId)
      } else {
        // Just fetch the current category
        const category = await tx.category.findOne({ id: originalTransaction.categoryId })
        if (!category) {
          throw new Error(`Category with id ${originalTransaction.categoryId} not found`)
        }
        newCategoryUpdated = category
      }

      return {
        transaction,
        originalTransaction,
        accountUpdated,
        oldCategoryUpdated,
        newCategoryUpdated,
      }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionUpdatedEvent({
        transaction: result.transaction,
        originalTransaction: result.originalTransaction,
        accountUpdated: result.accountUpdated,
        oldCategoryUpdated: result.oldCategoryUpdated,
        newCategoryUpdated: result.newCategoryUpdated,
        acknowledgmentId,
      }),
    )

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
