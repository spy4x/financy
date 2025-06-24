import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionCreateCommand } from "@api/cqrs/commands.ts"
import { TransactionCreatedEvent } from "@api/cqrs/events.ts"
import { TransactionType } from "@shared/types"

/**
 * Handler for creating a transaction
 * This includes updating account balance and category usage count
 */
export const transactionCreateHandler: CommandHandler<TransactionCreateCommand> = async (
  command,
) => {
  const { transaction: transactionData, userId, acknowledgmentId } = command.data

  console.log(`Creating transaction for user ${userId}...`)

  try {
    // Create transaction data with userId as createdBy
    const transactionToCreate = { ...transactionData, createdBy: userId }

    // Verify legitimacy before processing
    if (await db.transaction.verifyLegitimacy(transactionToCreate, userId) === false) {
      throw new Error("Transaction is not legitimate for this user")
    }

    const result = await db.begin(async (tx) => {
      // Create the transaction
      const transaction = await tx.transaction.createOne({
        data: transactionToCreate,
      })

      // Update account balance
      const balanceChange = transactionData.type === TransactionType.DEBIT
        ? -transactionData.amount
        : transactionData.amount
      const accountUpdated = await tx.account.updateBalance(
        transactionData.accountId,
        balanceChange,
      )

      // Update category usage count
      const categoryUpdated = await tx.category.incrementUsage(transactionData.categoryId)

      return { transaction, accountUpdated, categoryUpdated }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionCreatedEvent({
        transaction: result.transaction,
        accountUpdated: result.accountUpdated,
        categoryUpdated: result.categoryUpdated,
        acknowledgmentId,
      }),
    )

    console.log(`✅ Transaction created successfully for user ${userId}`)

    return { transaction: result.transaction }
  } catch (error) {
    console.error(`❌ Failed to create transaction for user ${userId}:`, error)
    throw error
  }
}
