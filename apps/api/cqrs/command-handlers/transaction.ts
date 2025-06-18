import { CommandHandler } from "@shared/cqrs/types.ts"
import {
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionUpdateCommand,
} from "@shared/rpc"
import {
  TransactionCreatedEvent,
  TransactionDeletedEvent,
  TransactionUpdatedEvent,
} from "@shared/rpc"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for creating a transaction
 */
export const TransactionCreateHandler: CommandHandler<TransactionCreateCommand> = async (
  command,
) => {
  const { transaction: transactionData, acknowledgmentId } = command.data

  console.log(`Creating transaction for account ${transactionData.accountId}...`)

  // Verify legitimacy before creating
  const isLegitimate = await db.transaction.verifyLegitimacy(
    transactionData,
    transactionData.createdBy,
  )
  if (!isLegitimate) {
    throw new Error("Transaction is not legitimate")
  }

  const transaction = await db.transaction.createOne({ data: transactionData })

  // Emit event for WebSocket notifications and other side effects
  eventBus.emit(
    new TransactionCreatedEvent({
      transaction,
      acknowledgmentId,
    }),
  )

  return { transaction }
}

/**
 * Handler for updating a transaction
 */
export const TransactionUpdateHandler: CommandHandler<TransactionUpdateCommand> = async (
  command,
) => {
  const { id, transaction: transactionUpdate, acknowledgmentId } = command.data

  console.log(`Updating transaction ${id}...`)

  // Get the existing transaction to verify legitimacy
  const existingTransaction = await db.transaction.findOne({ id })
  if (!existingTransaction) {
    throw new Error("Transaction not found")
  }

  // Verify legitimacy before updating
  const isLegitimate = await db.transaction.verifyLegitimacyById(id, existingTransaction.createdBy)
  if (!isLegitimate) {
    throw new Error("Transaction is not legitimate")
  }

  const transaction = await db.transaction.updateOne({
    id,
    data: transactionUpdate,
  })

  // Emit event for WebSocket notifications and other side effects
  eventBus.emit(
    new TransactionUpdatedEvent({
      transaction,
      acknowledgmentId,
    }),
  )

  return { transaction }
}

/**
 * Handler for deleting a transaction
 */
export const TransactionDeleteHandler: CommandHandler<TransactionDeleteCommand> = async (
  command,
) => {
  const { id, userId, acknowledgmentId } = command.data

  console.log(`Deleting transaction ${id}...`)

  // Verify legitimacy before deleting
  const isLegitimate = await db.transaction.verifyLegitimacyById(id, userId)
  if (!isLegitimate) {
    throw new Error("Transaction is not legitimate")
  }

  const transaction = await db.transaction.deleteOne({ id })

  // Emit event for WebSocket notifications and other side effects
  eventBus.emit(
    new TransactionDeletedEvent({
      transaction,
      acknowledgmentId,
    }),
  )

  return { transaction }
}
