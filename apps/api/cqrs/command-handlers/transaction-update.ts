import { CommandHandler } from "@shared/cqrs/types.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { TransactionUpdateCommand } from "@api/cqrs/commands.ts"
import { TransactionUpdatedEvent } from "@api/cqrs/events.ts"
import { Transaction, TransactionDirection, TransactionUtils } from "@shared/types"

/**
 * Handler for updating a transaction
 * Balance is calculated on the frontend from transactions
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
      const validationError = TransactionUtils.validateFields({
        ...originalTransaction,
        ...updates,
      })
      if (validationError) {
        throw new Error(validationError)
      }

      // SECURITY: Auto-determine direction and enforce correct sign
      // Never trust frontend - backend validates and corrects everything
      const correctedUpdates = { ...updates }

      // AUTO-DETERMINE DIRECTION: Always set direction based on transaction type if type is being updated
      if (updates.type !== undefined) {
        correctedUpdates.direction = TransactionUtils.getDirectionFromType(updates.type)
      }

      if (
        updates.amount !== undefined || updates.direction !== undefined ||
        updates.type !== undefined
      ) {
        const newDirection = correctedUpdates.direction ?? updates.direction ??
          originalTransaction.direction
        const newAmount = updates.amount ?? originalTransaction.amount

        // Enforce correct sign based on direction
        const absoluteAmount = Math.abs(newAmount)
        const correctedAmount = newDirection === TransactionDirection.MONEY_OUT
          ? -absoluteAmount // MONEY_OUT: always negative
          : absoluteAmount // MONEY_IN: always positive

        correctedUpdates.amount = correctedAmount

        // Apply the same correction to original amount if being updated
        if (updates.originalAmount !== undefined) {
          const absoluteOriginalAmount = Math.abs(updates.originalAmount)
          correctedUpdates.originalAmount = newDirection === TransactionDirection.MONEY_OUT
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

      let linkedTransaction: Transaction | null = null

      // If this is a transfer, update the linked transaction
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
          // Handle amount updates for transfers
          if (correctedUpdates.amount !== undefined) {
            const newAmount = correctedUpdates.amount
            const originalDirection = originalTransaction.direction
            const newDirection = correctedUpdates.direction ?? originalDirection

            // Linked transaction has opposite direction
            const linkedDirection = newDirection === TransactionDirection.MONEY_OUT
              ? TransactionDirection.MONEY_IN
              : TransactionDirection.MONEY_OUT

            // Amount sign follows the direction
            const absoluteNewAmount = Math.abs(newAmount)
            const linkedAmount = linkedDirection === TransactionDirection.MONEY_OUT
              ? -absoluteNewAmount
              : absoluteNewAmount

            linkedTransaction = await tx.transaction.updateOne({
              id: linkedTransactionData.id,
              data: {
                amount: linkedAmount,
                direction: linkedDirection,
              },
            })
          }

          // Handle direction-only updates for transfers
          if (correctedUpdates.direction !== undefined && correctedUpdates.amount === undefined) {
            const newDirection = correctedUpdates.direction
            const linkedDirection = newDirection === TransactionDirection.MONEY_OUT
              ? TransactionDirection.MONEY_IN
              : TransactionDirection.MONEY_OUT

            linkedTransaction = await tx.transaction.updateOne({
              id: linkedTransactionData.id,
              data: { direction: linkedDirection },
            })
          }
        }
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
        linkedTransaction,
      }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new TransactionUpdatedEvent({
        transaction: result.transaction,
        originalTransaction: result.originalTransaction,
        acknowledgmentId,
      }),
    )

    // Emit event for linked transaction if updated
    if (result.linkedTransaction) {
      eventBus.emit(
        new TransactionUpdatedEvent({
          transaction: result.linkedTransaction,
          originalTransaction: result.linkedTransaction, // Use the updated transaction as both
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
