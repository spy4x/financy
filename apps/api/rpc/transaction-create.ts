// =============================================================================
// Transaction Create RPC Handler
// =============================================================================
// This file contains the handler for creating transactions via RPC.
// =============================================================================

import type { RPCContext, RPCHandler } from "../../../libs/shared/rpc/types.ts"
import type {
  TransactionCreateError,
  TransactionCreatePayload,
  TransactionCreateResult,
} from "../../../libs/shared/rpc/transaction.ts"
import { TransactionType } from "../../../libs/shared/types/+index.ts"
import { db } from "../services/db.ts"
import { eventBus } from "../services/eventBus.ts"
import { TransactionCreatedEvent } from "../../../libs/shared/rpc/events.ts"

/**
 * Handler for creating a transaction via RPC
 */
export const transactionCreateHandler: RPCHandler<
  TransactionCreatePayload,
  TransactionCreateResult,
  TransactionCreateError
> = async (payload: TransactionCreatePayload, context: RPCContext) => {
  const { transaction: transactionData } = payload
  const { userId } = context

  console.log(`Creating transaction for account ${transactionData.accountId}...`)

  try {
    // Verify user has access to the account via group membership
    const account = await db.account.findOne({ id: transactionData.accountId })
    if (!account) {
      return {
        data: null,
        error: {
          code: "ACCOUNT_NOT_FOUND",
          message: "Account not found",
        },
      }
    }

    // Check if user has permission to create transactions in this group
    const groupMemberships = await db.groupMembership.findMany(userId)
    const membership = groupMemberships.find((m) => m.groupId === account.groupId && !m.deletedAt)

    if (!membership || membership.role < 2) { // Editor role or higher
      return {
        data: null,
        error: {
          code: "PERMISSION_DENIED",
          message: "Insufficient permissions to create transactions",
        },
      }
    }

    // Create the transaction with proper data structure
    const transactionToCreate = {
      accountId: transactionData.accountId,
      type: transactionData.type,
      amount: transactionData.amount,
      originalCurrency: transactionData.originalCurrency || account.currency,
      originalAmount: transactionData.originalAmount || transactionData.amount,
      categoryId: transactionData.categoryId || 0,
      memo: transactionData.memo || "",
      groupId: account.groupId,
      createdBy: userId,
    }

    const transaction = await db.transaction.createOne({
      data: transactionToCreate,
    })

    // Update account balance
    const balanceChange = transactionData.type === TransactionType.CREDIT
      ? transactionData.amount
      : -transactionData.amount
    await db.account.updateOne({
      id: transactionData.accountId,
      data: { balance: account.balance + balanceChange },
    })

    // Emit event for WebSocket notifications
    if (TransactionCreatedEvent) {
      eventBus.emit(
        new TransactionCreatedEvent({
          transaction,
        }),
      )
    }

    return {
      data: {
        id: transaction.id,
        groupId: transaction.groupId,
        accountId: transaction.accountId,
        type: transaction.type,
        amount: transaction.amount,
        originalCurrency: transaction.originalCurrency,
        originalAmount: transaction.originalAmount,
        categoryId: transaction.categoryId,
        memo: transaction.memo,
        createdBy: transaction.createdBy,
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString(),
      },
      error: null,
    }
  } catch (error) {
    console.error("Failed to create transaction:", error)
    return {
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to create transaction",
        details: { error: error instanceof Error ? error.message : String(error) },
      },
    }
  }
}
