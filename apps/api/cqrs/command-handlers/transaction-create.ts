import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionCreateCommand } from "@api/cqrs/commands.ts"
import { TransactionCreatedEvent } from "@api/cqrs/events.ts"
import { TransactionDirection, TransactionUtils } from "@shared/types"

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

    // AUTO-DETERMINE DIRECTION: Always set direction based on transaction type
    // Never trust frontend - backend always determines the correct direction
    transactionToCreate.direction = TransactionUtils.getDirectionFromType(transactionData.type)

    // SECURITY: Enforce correct sign based on transaction direction
    // Never trust frontend - backend validates and corrects the sign
    const absoluteAmount = Math.abs(transactionData.amount)
    const correctedAmount = transactionToCreate.direction === TransactionDirection.MONEY_OUT
      ? -absoluteAmount
      : absoluteAmount

    // Apply the same correction to original amount if present
    const correctedOriginalAmount = transactionData.originalAmount !== undefined
      ? (transactionToCreate.direction === TransactionDirection.MONEY_OUT
        ? -Math.abs(transactionData.originalAmount)
        : Math.abs(transactionData.originalAmount))
      : undefined

    // Update transaction data with corrected amounts
    transactionToCreate.amount = correctedAmount
    if (correctedOriginalAmount !== undefined) {
      transactionToCreate.originalAmount = correctedOriginalAmount
    }

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
      // Use the corrected amount (already signed properly)
      const balanceChange = correctedAmount
      const accountUpdated = await tx.account.updateBalance(
        transactionData.accountId,
        balanceChange,
      )

      return { transaction, accountUpdated }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionCreatedEvent({
        transaction: result.transaction,
        accountUpdated: result.accountUpdated,
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
